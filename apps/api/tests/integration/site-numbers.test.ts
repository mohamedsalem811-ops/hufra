// Plan 8.4: the website's public figures.
import { siteNumbersResponseSchema } from '@hufra/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { lastMonths } from '../../src/routes/site'
import { createTestEnv, json, request, type TestEnv } from './helpers/test-env'

let t: TestEnv
beforeEach(() => {
  t = createTestEnv()
})

const DAY = 86400000
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()

async function report(o: { region?: number; status?: string; createdDaysAgo: number; fixedAfterDays?: number; deleted?: boolean }) {
  const created = Date.now() - o.createdDaysAgo * DAY
  const fixed = o.fixedAfterDays !== undefined ? new Date(created + o.fixedAfterDays * DAY).toISOString() : null
  const r = await t.db
    .prepare('INSERT INTO potholes (region_id, lat, lng, status, created_at, fixed_at, deleted_at) VALUES (?, 32.88, 13.19, ?, ?, ?, ?)')
    .bind(o.region ?? 1, o.status ?? 'reported', new Date(created).toISOString(), fixed, o.deleted ? iso(0) : null)
    .run()
  return r.meta.last_row_id as number
}

describe('GET /api/site/numbers', () => {
  it('counts reports, repairs and money for anyone, without private details', async () => {
    await report({ createdDaysAgo: 2 })
    await report({ createdDaysAgo: 10, status: 'fixed', fixedAfterDays: 4, region: 2 })
    await report({ createdDaysAgo: 5, status: 'fixed', fixedAfterDays: 1 })
    await report({ createdDaysAgo: 1, deleted: true })
    const user = (await t.db.prepare('SELECT id FROM users LIMIT 1').first<{ id: number }>())!.id
    const open = (await t.db.prepare('INSERT INTO campaigns (pothole_id, target_millimes) VALUES (1, 900000)').run()).meta.last_row_id
    const done = (await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes, status, final_cost_millimes) VALUES (2, 500000, 'completed', 480000)`).run()).meta.last_row_id
    const give = (campaign: number, amount: number, status: string, ref: string) =>
      t.db.prepare('INSERT INTO donations (campaign_id, user_id, reference_code, amount_millimes, status) VALUES (?, ?, ?, ?, ?)').bind(campaign, user, ref, amount, status).run()
    await give(open, 100000, 'confirmed', 'HUF-1')
    await give(done, 500000, 'confirmed', 'HUF-2')
    await give(open, 70000, 'under_review', 'HUF-3')
    await t.db.prepare('INSERT INTO campaign_allocations (to_campaign_id, amount_millimes) VALUES (?, 20000)').bind(open).run()

    const res = await request(t.env, '/api/site/numbers')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=60')
    const n = siteNumbersResponseSchema.parse(await json(res))
    expect(n).toMatchObject({
      reports: 3,
      fixed: 2,
      open: 1,
      avg_fix_days: 2.5,
      confirmed_lyd: 600,
      spent_lyd: 480,
      in_open_campaigns_lyd: 120,
      moved_lyd: 20,
    })
    expect(n.monthly_fixed).toHaveLength(6)
    expect(n.monthly_fixed.reduce((a, m) => a + m.count, 0)).toBe(2)
    expect(n.by_region.find((r) => r.id === 2)).toMatchObject({ reports: 1, fixed: 1, avg_fix_days: 4 })
  })

  it('works on an empty database', async () => {
    const n = siteNumbersResponseSchema.parse(await json(await request(t.env, '/api/site/numbers')))
    expect(n).toMatchObject({ reports: 0, fixed: 0, open: 0, avg_fix_days: null, confirmed_lyd: 0, by_region: [] })
  })

  it('lists six calendar months ending this one, across a new year', () => {
    expect(lastMonths(new Date('2027-02-10T00:00:00Z'))).toEqual(['2026-09', '2026-10', '2026-11', '2026-12', '2027-01', '2027-02'])
  })
})

describe('transparency data', () => {
  it('lists completed campaigns with their final cost, newest first; open stays the default', async () => {
    await report({ createdDaysAgo: 30, status: 'fixed', fixedAfterDays: 5 })
    await report({ createdDaysAgo: 20, status: 'fixed', fixedAfterDays: 5 })
    await report({ createdDaysAgo: 10 })
    await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes, status, final_cost_millimes, closed_at) VALUES (1, 800000, 'completed', 750000, '2026-01-01T00:00:00.000Z')`).run()
    await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes, status, final_cost_millimes, closed_at) VALUES (2, 500000, 'completed', 500000, '2026-03-01T00:00:00.000Z')`).run()
    await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes) VALUES (3, 400000)`).run()

    const done = await json(await request(t.env, '/api/campaigns?status=completed'))
    expect(done.results.map((c: { pothole_id: number; final_cost_lyd: number }) => [c.pothole_id, c.final_cost_lyd])).toEqual([[2, 500], [1, 750]])
    const open = await json(await request(t.env, '/api/campaigns'))
    expect(open.results.map((c: { pothole_id: number }) => c.pothole_id)).toEqual([3])
    expect((await request(t.env, '/api/campaigns?status=bogus')).status).toBe(400)
  })

  it('offers every public report as open data, without who reported it', async () => {
    const id = await report({ createdDaysAgo: 3, status: 'fixed', fixedAfterDays: 2 })
    await t.db.prepare(`UPDATE potholes SET street_ar = '=cmd()', reporter_contact = '0912345678' WHERE id = ?`).bind(id).run()
    await report({ createdDaysAgo: 1, deleted: true })
    const res = await request(t.env, '/api/site/open-data.csv')
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=300')
    expect(res.headers.get('Content-Disposition')).toMatch(/hufra-open-data-\d{4}-\d{2}-\d{2}\.csv/)
    const text = new TextDecoder().decode(await res.arrayBuffer())
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toBe('id,created_at,status,severity,region_ar,region_en,street_ar,street_en,lat,lng,confirmations,verified_at,under_repair_at,fixed_at,days_to_fix')
    expect(lines).toHaveLength(2)
    expect(lines[1]).toContain(`,fixed,`)
    expect(lines[1]).toContain(`'=cmd()`)
    expect(text).not.toMatch(/0912345678|reporter/)
  })
})
