// Plan 8.2g: dashboard numbers for a period, and the CSV export of reports.
import { adminCountsResponseSchema, dashboardResponseSchema } from '@hufra/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { csvCell } from '../../src/lib/csv'
import { createTestEnv, json, request, type TestEnv } from './helpers/test-env'

let t: TestEnv
const PW = 'Str0ngP@ssw0rd!'
const H = { 'Content-Type': 'application/json' }

beforeEach(() => {
  t = createTestEnv()
})

async function admin(email = 'boss@example.com') {
  await request(t.env, '/api/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ email, password: PW, consent: true }) })
  await t.db.prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run()
  const body = await json(await request(t.env, '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email, password: PW }) }))
  return { Authorization: `Bearer ${body.access_token}` }
}

const DAY = 24 * 60 * 60 * 1000
const daysAgo = (d: number) => new Date(Date.now() - d * DAY).toISOString()

async function report(o: { region?: number; status?: string; created: number; fixedAfter?: number; street?: string; deleted?: boolean }) {
  const created = daysAgo(o.created)
  const fixedAt = o.fixedAfter !== undefined ? new Date(Date.parse(created) + o.fixedAfter * DAY).toISOString() : null
  const res = await t.db
    .prepare(`INSERT INTO potholes (region_id, lat, lng, status, created_at, fixed_at, street_ar, deleted_at) VALUES (?, 32.88, 13.19, ?, ?, ?, ?, ?)`)
    .bind(o.region ?? 1, o.status ?? 'reported', created, fixedAt, o.street ?? null, o.deleted ? created : null)
    .run()
  return res.meta.last_row_id as number
}

describe('GET /api/admin/dashboard', () => {
  it('counts the period against the one before, and fills every tile', async () => {
    const auth = await admin()
    await report({ created: 1 })
    await report({ created: 5 }) // waiting more than 3 days
    await report({ created: 40, status: 'verified' }) // previous 30-day period
    await report({ created: 10, status: 'under_repair', region: 2 })
    await report({ created: 20, status: 'fixed', fixedAfter: 4 })
    await report({ created: 9, status: 'fixed', fixedAfter: 3, region: 2 })
    await report({ created: 200, status: 'fixed', fixedAfter: 10 }) // fixed long ago
    await report({ created: 2, deleted: true })

    const res = await request(t.env, '/api/admin/dashboard?days=30', { headers: auth })
    expect(res.status).toBe(200)
    const d = dashboardResponseSchema.parse(await json(res))
    expect(d.days).toBe(30)
    expect(d.tiles).toMatchObject({
      new_reports: 5,
      new_reports_previous: 1,
      awaiting_verification: 2,
      under_repair: 1,
      under_repair_regions: 1,
      fixed: 2,
      avg_fix_days: 3.5,
      confirmed_lyd: 0,
      under_review_lyd: 0,
    })
    expect(Date.parse(d.tiles.oldest_waiting_at!)).toBeLessThan(Date.now() - 4 * DAY)
    expect(d.by_status).toEqual({ reported: 2, verified: 1, under_repair: 1, fixed: 3 })
    expect(d.todo).toEqual({ stale_reports: 1, donations_to_review: 0, funded_campaigns: 0, duplicates: 0 })

    // Twelve rolling weeks; the last holds the past 7 days.
    expect(d.weekly).toHaveLength(12)
    expect(d.weekly.at(-1)!.count).toBe(2)
    expect(d.weekly.at(-2)!.count).toBe(2) // 9 and 10 days ago
    expect(d.weekly.reduce((n, w) => n + w.count, 0)).toBe(6) // 200 days ago is outside

    const r1 = d.by_region.find((r) => r.id === 1)!
    expect(r1).toMatchObject({ open: 3, fixed: 1, avg_fix_days: 4 })
    expect(d.by_region[0]!.open).toBeGreaterThanOrEqual(d.by_region.at(-1)!.open)
  })

  it('sums donations and open campaign gaps', async () => {
    const auth = await admin()
    const owner = (await t.db.prepare(`SELECT id FROM users WHERE email = 'boss@example.com'`).first<{ id: number }>())!.id
    const p = await report({ created: 3 })
    const camp = (await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes) VALUES (?, 500000)`).bind(p).run()).meta.last_row_id
    const give = (amount: number, status: string, ref: string) =>
      t.db.prepare(`INSERT INTO donations (campaign_id, user_id, reference_code, amount_millimes, status, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(camp, owner, ref, amount, status, status === 'confirmed' ? daysAgo(1) : null).run()
    await give(120000, 'confirmed', 'HUF-A')
    await give(30500, 'under_review', 'HUF-B')
    const d = dashboardResponseSchema.parse(await json(await request(t.env, '/api/admin/dashboard?days=7', { headers: auth })))
    expect(d.tiles.confirmed_lyd).toBe(120)
    expect(d.tiles.under_review_lyd).toBe(30.5)
    expect(d.campaigns).toEqual({ open: 1, missing_lyd: 380 })
    expect(d.todo.donations_to_review).toBe(1)
  })

  it('accepts only the offered periods and staff', async () => {
    const auth = await admin()
    expect((await request(t.env, '/api/admin/dashboard?days=12', { headers: auth })).status).toBe(400)
    expect((await request(t.env, '/api/admin/dashboard')).status).toBe(401)
    expect((await json(await request(t.env, '/api/admin/dashboard', { headers: auth }))).days).toBe(30)
  })
})

describe('GET /api/admin/export/reports.csv', () => {
  it('exports the filtered reports with Arabic intact, no reporter, and records the export', async () => {
    const auth = await admin()
    await report({ created: 2, street: 'شارع "النصر", طرابلس' })
    await report({ created: 50, street: '=HYPERLINK("x")' })
    await report({ created: 3, status: 'fixed', fixedAfter: 2 })

    const res = await request(t.env, '/api/admin/export/reports.csv?status=reported', { headers: auth })
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('Content-Disposition')).toMatch(/^attachment; filename="hufra-reports-\d{4}-\d{2}-\d{2}\.csv"$/)
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]) // UTF-8 byte-order mark, for Excel
    const text = new TextDecoder().decode(bytes) // drops the mark
    const lines = text.trim().split('\r\n')
    expect(lines[0]).toBe('id,created_at,status,severity,region_ar,region_en,street_ar,street_en,lat,lng,confirmations,verified_at,under_repair_at,fixed_at,days_to_fix,link')
    expect(lines).toHaveLength(3)
    expect(text).toContain('"شارع ""النصر"", طرابلس"')
    expect(text).toContain(`"'=HYPERLINK(""x"")"`)
    expect(text).not.toMatch(/reporter|@example\.com/)

    const recent = await request(t.env, '/api/admin/export/reports.csv?days=30', { headers: auth })
    const rows = (await recent.text()).trim().split('\r\n')
    expect(rows).toHaveLength(3) // header + the two recent ones
    expect(rows.find((l) => l.includes(',fixed,'))).toMatch(/,2,http:\/\/[^,]+\/pothole\/\d+$/)

    const audit = await t.db.prepare(`SELECT after_json FROM audit_logs WHERE action = 'export.reports' ORDER BY id`).all<{ after_json: string }>()
    expect(audit.results.map((a) => JSON.parse(a.after_json))).toEqual([
      { rows: 2, filters: { status: 'reported' } },
      { rows: 2, filters: { days: '30' } },
    ])
    expect((await request(t.env, '/api/admin/export/reports.csv')).status).toBe(401)
  })

  it('csvCell quotes and defuses formulas', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(3.5)).toBe('3.5')
    expect(csvCell(-2)).toBe('-2') // numbers stay numbers
    expect(csvCell('-cmd')).toBe("'-cmd")
    expect(csvCell('@x')).toBe("'@x")
    expect(csvCell('a\nb')).toBe('"a\nb"')
  })
})

describe('menu counts include unread notifications', () => {
  it('counts the signed-in admin’s unread notifications', async () => {
    const auth = await admin()
    await t.db.prepare(`INSERT INTO notifications (target_role, type, payload_json) VALUES ('admin', 'new_report', '{}')`).run()
    const counts = adminCountsResponseSchema.parse(await json(await request(t.env, '/api/admin/counts', { headers: auth })))
    expect(counts.unread_notifications).toBe(1)
    await request(t.env, '/api/notifications/read-all', { method: 'POST', headers: { ...auth, ...H }, body: '{}' })
    expect((await json(await request(t.env, '/api/admin/counts', { headers: auth }))).unread_notifications).toBe(0)
  })
})
