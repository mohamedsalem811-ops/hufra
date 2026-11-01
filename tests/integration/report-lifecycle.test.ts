// Integration test: full pothole report lifecycle through the REAL Hono
// routes + REAL migrated SQLite schema (triggers included). This exercises
// the exact code path a production request takes: HTTP -> Hono routing ->
// middleware -> route handler -> D1-shaped SQL -> triggers.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function createGuestReport(env: TestEnv['env'], overrides: Record<string, unknown> = {}) {
  return request(env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      lat: 32.8811,
      lng: 13.3502,
      severity: 'medium',
      description_ar: 'حفرة كبيرة في الشارع',
      description_en: 'Large pothole in the street',
      ...overrides,
    }),
  })
}

describe('report lifecycle (guest report -> admin verifies -> fixed)', () => {
  it('a guest can submit a report without authentication', async () => {
    const res = await createGuestReport(t.env)
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body.status).toBe('reported')
    expect(typeof body.id).toBe('number')
  })

  it('auto-assigns the nearest active region when region_id is omitted', async () => {
    const res = await createGuestReport(t.env)
    const body = await json(res)
    const detail = await json(await request(t.env, `/api/potholes/${body.id}`))
    // 32.8811,13.3502 is the exact seeded center of "tajoura" (migrations/0003).
    expect(detail.pothole.region_slug).toBe('tajoura')
  })

  it('rejects coordinates far outside plausible Libya bounds', async () => {
    const res = await createGuestReport(t.env, { lat: 51.5, lng: -0.12 }) // London
    expect(res.status).toBe(400)
  })

  it('creates an initial status_history row on report creation via the app code path', async () => {
    const res = await createGuestReport(t.env)
    const { id } = await json(res)
    const detail = await json(await request(t.env, `/api/potholes/${id}`))
    expect(detail.history).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({ from_status: null, to_status: 'reported' })
  })

  it('lists the new report in GET /api/potholes with status filter', async () => {
    await createGuestReport(t.env)
    const res = await request(t.env, '/api/potholes?status=reported')
    const body = await json(res)
    expect(body.results.length).toBe(1)
    expect(body.results[0].status).toBe('reported')
  })

  it('increments view_count on GET /api/potholes/:id', async () => {
    const { id } = await json(await createGuestReport(t.env))
    await request(t.env, `/api/potholes/${id}`)
    const detail2 = await json(await request(t.env, `/api/potholes/${id}`))
    // First GET above bumped it to 1, second GET bumps to 2, response reflects
    // the value AFTER its own increment is not returned - check via raw DB.
    const row = await t.db.prepare('SELECT view_count FROM potholes WHERE id = ?').bind(id).first<{ view_count: number }>()
    expect(row!.view_count).toBeGreaterThanOrEqual(2)
  })

  it('/api/potholes/counters reflects totals without using any KV writes', async () => {
    await createGuestReport(t.env)
    const first = await json(await request(t.env, '/api/potholes/counters'))
    expect(first.totals.total).toBe(1)
    expect(first.totals.reported).toBe(1)

    // Public caches live in the edge cache and rate limits in D1: KV (1,000
    // free writes/day) is not touched by reading the homepage or reporting.
    expect(t.kv.size).toBe(0)
  })
})

describe('duplicate detection (~50m radius)', () => {
  it('flags a second nearby open report as a duplicate of the first', async () => {
    const first = await json(await createGuestReport(t.env, { lat: 32.8811, lng: 13.3502 }))
    // ~20m away (well within DUPLICATE_RADIUS_METERS).
    await createGuestReport(t.env, { lat: 32.88128, lng: 13.3502 })

    const flags = await t.db
      .prepare('SELECT * FROM duplicate_flags WHERE duplicate_of_id = ?')
      .bind(first.id)
      .all()
    expect(flags.results.length).toBe(1)
  })

  it('does NOT flag a report ~5km away as a duplicate', async () => {
    const first = await json(await createGuestReport(t.env, { lat: 32.8811, lng: 13.3502 }))
    await createGuestReport(t.env, { lat: 32.9300, lng: 13.3502 }) // roughly 5.4km north

    const flags = await t.db
      .prepare('SELECT * FROM duplicate_flags WHERE duplicate_of_id = ?')
      .bind(first.id)
      .all()
    expect(flags.results.length).toBe(0)
  })

  it('does NOT flag a nearby report if the original is already fixed', async () => {
    const first = await json(await createGuestReport(t.env, { lat: 32.8811, lng: 13.3502 }))

    // Manually flip status to 'fixed' (bypassing the admin route, purely to
    // set up the pre-condition for this test).
    await t.db.prepare(`UPDATE potholes SET status = 'fixed' WHERE id = ?`).bind(first.id).run()

    await createGuestReport(t.env, { lat: 32.88128, lng: 13.3502 })

    const flags = await t.db
      .prepare('SELECT * FROM duplicate_flags WHERE duplicate_of_id = ?')
      .bind(first.id)
      .all()
    expect(flags.results.length).toBe(0)
  })
})
