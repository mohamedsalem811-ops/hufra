// Reports and "I saw it too" need an account once REPORTS_REQUIRE_ACCOUNT is
// "true" (switched on when the old website is removed, plan 9.2). Until then
// the old site's guest reports keep working.
import { describe, it, expect } from 'vitest'
import { ANONYMOUS, createTestEnv, defaultReporterToken, json, request } from './helpers/test-env'

const report = (t: ReturnType<typeof createTestEnv>, headers: Record<string, string>) =>
  request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium' }),
  })

describe('reports need an account (REPORTS_REQUIRE_ACCOUNT=true)', () => {
  it('refuses a report and a confirmation without an account, with a plain message', async () => {
    const t = createTestEnv()
    const created = await json(await report(t, {}))
    t.env.REPORTS_REQUIRE_ACCOUNT = 'true'
    const res = await report(t, { [ANONYMOUS]: '1' })
    expect(res.status).toBe(401)
    expect(await json(res)).toEqual({ error: 'Sign in to report a pothole', error_ar: 'سجّل الدخول لتبلّغ عن حفرة' })
    const vote = await request(t.env, `/api/potholes/${created.id}/upvote`, { method: 'POST' })
    expect(vote.status).toBe(401)
  })

  it('accepts both from a signed-in person and links the report to them', async () => {
    const t = createTestEnv()
    t.env.REPORTS_REQUIRE_ACCOUNT = 'true'
    const token = await defaultReporterToken(t.env)
    const res = await report(t, { Authorization: `Bearer ${token}` })
    expect(res.status).toBe(201)
    const id = (await json(res)).id
    const row = await t.db.prepare('SELECT reporter_id FROM potholes WHERE id = ?').bind(id).first<{ reporter_id: number }>()
    expect(row?.reporter_id).toBeGreaterThan(0)
    const vote = await request(t.env, `/api/potholes/${id}/upvote`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect(vote.status).toBe(201)
  })

  it('still takes guest reports while the switch is off (the old website)', async () => {
    const t = createTestEnv()
    expect((await report(t, { [ANONYMOUS]: '1' })).status).toBe(201)
  })
})
