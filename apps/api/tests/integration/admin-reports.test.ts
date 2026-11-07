// Plan 8.2: the admin panel's report queue and report page.
import { describe, it, expect, beforeEach } from 'vitest'
import type { z } from 'zod'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv
const H = (token?: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
const get = (p: string, token?: string) => request(t.env, p, { headers: H(token) })
const send = (method: string, p: string, body: unknown, token?: string) => request(t.env, p, { method, headers: H(token), body: JSON.stringify(body) })

async function parse<S extends z.ZodType>(res: Response, schema: S, status = 200): Promise<z.infer<S>> {
  const body = await json(res)
  expect(res.status, JSON.stringify(body)).toBe(status)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(`Contract mismatch: ${JSON.stringify(parsed.error.issues)}`)
  return parsed.data
}
async function account(email: string, role?: 'admin' | 'super_admin', display_name?: string) {
  await send('POST', '/api/auth/register', { email, password: PW, consent: true, display_name })
  if (role) await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const body = await json(await send('POST', '/api/auth/login', { email, password: PW }))
  return { token: body.access_token as string, id: body.user.id as number }
}
const report = async (token: string, over: Record<string, unknown> = {}) =>
  (await json(await send('POST', '/api/potholes', { lat: 32.88, lng: 13.19, severity: 'medium', ...over }, token))).id as number

let admin: { token: string; id: number }
let citizen: { token: string; id: number }
beforeEach(async () => {
  t = createTestEnv()
  admin = await account('staff@hufra.ly', 'admin', 'سالم')
  citizen = await account('citizen@hufra.ly', undefined, 'مواطن')
})

describe('GET /api/admin/queue', () => {
  it('is for staff only', async () => {
    expect((await get('/api/admin/queue', citizen.token)).status).toBe(403)
    expect((await get('/api/admin/queue')).status).toBe(401)
  })

  it('pages with a total, newest first by default', async () => {
    const ids = []
    for (let i = 0; i < 5; i++) ids.push(await report(citizen.token, { lat: 32.8 + i * 0.01 }))
    const page1 = await parse(await get('/api/admin/queue?page_size=2', admin.token), C.reportQueueResponseSchema)
    expect(page1.total).toBe(5)
    expect(page1.results.map((r) => r.id)).toEqual([ids[4], ids[3]])
    const page3 = await parse(await get('/api/admin/queue?page_size=2&page=3', admin.token), C.reportQueueResponseSchema)
    expect(page3.results.map((r) => r.id)).toEqual([ids[0]])
    const oldest = await parse(await get('/api/admin/queue?sort=oldest&page_size=1', admin.token), C.reportQueueResponseSchema)
    expect(oldest.results[0]!.id).toBe(ids[0])
  })

  it('filters by status and severity, and finds by number or street', async () => {
    const a = await report(citizen.token, { street_ar: 'شارع الجمهورية', severity: 'severe' })
    const b = await report(citizen.token, { lat: 32.9, street_ar: 'طريق الشط' })
    await send('PATCH', `/api/potholes/${b}/status`, { status: 'verified' }, admin.token)

    const q = async (qs: string) => (await parse(await get(`/api/admin/queue?${qs}`, admin.token), C.reportQueueResponseSchema)).results.map((r) => r.id)
    expect(await q('status=verified')).toEqual([b])
    expect(await q('severity=severe')).toEqual([a])
    expect(await q(`q=%23${a}`)).toEqual([a])
    expect(await q(`q=${encodeURIComponent('الشط')}`)).toEqual([b])
    expect(await q('q=%25')).toEqual([]) // a literal %, not "everything"
    expect((await get('/api/admin/queue?sort=random', admin.token)).status).toBe(400)
  })

  it('shows duplicate flags and the campaign', async () => {
    const first = await report(citizen.token, { lat: 32.8811, lng: 13.3502 })
    const second = await report(citizen.token, { lat: 32.88128, lng: 13.3502 })
    await send('PATCH', `/api/potholes/${first}/status`, { status: 'verified' }, admin.token)
    await t.db.prepare('INSERT INTO campaigns (pothole_id, target_millimes, created_by) VALUES (?, 1200000, ?)').bind(first, admin.id).run()

    const body = await parse(await get('/api/admin/queue', admin.token), C.reportQueueResponseSchema)
    const byId = Object.fromEntries(body.results.map((r) => [r.id, r]))
    expect(byId[second]!.duplicate_flag_count).toBe(1)
    expect(byId[first]!.duplicate_flag_count).toBe(1)
    expect(byId[first]!.campaign).toMatchObject({ status: 'active', target_lyd: 1200, confirmed_lyd: 0 })
    expect(byId[second]!.campaign).toBeNull()
    const dups = await parse(await get('/api/admin/queue?duplicates=1', admin.token), C.reportQueueResponseSchema)
    expect(dups.total).toBe(2)
  })
})

describe('GET /api/admin/reports/:id', () => {
  it('gives the whole report page in one call', async () => {
    const id = await report(citizen.token, { lat: 32.8811, lng: 13.3502, description_ar: 'حفرة عميقة', reporter_contact: '0910000000' })
    const near = await report(citizen.token, { lat: 32.88128, lng: 13.3502 })
    await send('PATCH', `/api/potholes/${id}/status`, { status: 'verified', note: 'زيارة ميدانية' }, admin.token)

    const page = await parse(await get(`/api/admin/reports/${id}`, admin.token), C.adminReportResponseSchema)
    expect(page.pothole.reporter_contact).toBe('0910000000')
    expect(page.reporter).toMatchObject({ id: citizen.id, email: 'citizen@hufra.ly', display_name: 'مواطن' })
    expect(page.history[0]).toMatchObject({ to_status: 'verified', note: 'زيارة ميدانية', actor_name: 'سالم' })
    // The citizen's own "report submitted" entry never names them.
    expect(page.history.at(-1)).toMatchObject({ to_status: 'reported', actor_name: null })
    expect(page.duplicates).toEqual([expect.objectContaining({ other_id: near, this_is_newer: false })])
    expect(page.campaign).toBeNull()

    const other = await parse(await get(`/api/admin/reports/${near}`, admin.token), C.adminReportResponseSchema)
    expect(other.duplicates[0]).toMatchObject({ other_id: id, this_is_newer: true })
  })

  it('prefers the open campaign', async () => {
    const id = await report(citizen.token)
    await t.db.prepare(`INSERT INTO campaigns (pothole_id, target_millimes, status, closed_at) VALUES (?, 500000, 'cancelled', '2026-01-01T00:00:00Z')`).bind(id).run()
    await t.db.prepare('INSERT INTO campaigns (pothole_id, target_millimes) VALUES (?, 900000)').bind(id).run()
    const page = await parse(await get(`/api/admin/reports/${id}`, admin.token), C.adminReportResponseSchema)
    expect(page.campaign).toMatchObject({ status: 'active', target_lyd: 900 })
  })

  it('answers 404, 400 and 403 plainly', async () => {
    expect((await get('/api/admin/reports/999', admin.token)).status).toBe(404)
    expect((await get('/api/admin/reports/abc', admin.token)).status).toBe(400)
    expect((await get('/api/admin/reports/1', citizen.token)).status).toBe(403)
  })
})

describe('status change without notifying', () => {
  it('skips the reporter notification when asked', async () => {
    const id = await report(citizen.token)
    await send('PATCH', `/api/potholes/${id}/status`, { status: 'verified', notify: false }, admin.token)
    let inbox = await json(await get('/api/notifications', citizen.token))
    expect(inbox.results).toHaveLength(0)
    await send('PATCH', `/api/potholes/${id}/status`, { status: 'under_repair' }, admin.token)
    inbox = await json(await get('/api/notifications', citizen.token))
    expect(inbox.results).toHaveLength(1)
  })
})
