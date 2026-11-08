// Reports and "I saw it too" need an account (plan 7.1). The old website let
// guests report; since it was removed (plan 9.2) the server always refuses them.
import { describe, it, expect } from 'vitest'
import { ANONYMOUS, createTestEnv, defaultReporterToken, json, request } from './helpers/test-env'

const report = (t: ReturnType<typeof createTestEnv>, headers: Record<string, string>) =>
  request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium' }),
  })

describe('reports need an account', () => {
  it('refuses a report and a confirmation without an account, with a plain message', async () => {
    const t = createTestEnv()
    const created = await json(await report(t, {}))
    const res = await report(t, { [ANONYMOUS]: '1' })
    expect(res.status).toBe(401)
    expect(await json(res)).toEqual({ error: 'Sign in to report a pothole', error_ar: 'سجّل الدخول لتبلّغ عن حفرة' })
    const vote = await request(t.env, `/api/potholes/${created.id}/upvote`, { method: 'POST' })
    expect(vote.status).toBe(401)
    expect(await json(vote)).toEqual({ error: 'Sign in to confirm this pothole', error_ar: 'سجّل الدخول لتأكيد وجود الحفرة' })
  })

  it('accepts both from a signed-in person and links the report to them', async () => {
    const t = createTestEnv()
    const token = await defaultReporterToken(t.env)
    const res = await report(t, { Authorization: `Bearer ${token}` })
    expect(res.status).toBe(201)
    const id = (await json(res)).id
    const row = await t.db.prepare('SELECT reporter_id FROM potholes WHERE id = ?').bind(id).first<{ reporter_id: number }>()
    expect(row?.reporter_id).toBeGreaterThan(0)
    const vote = await request(t.env, `/api/potholes/${id}/upvote`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    expect(vote.status).toBe(201)
  })
})
