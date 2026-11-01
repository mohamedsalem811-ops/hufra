// Contract tests: real API responses must match the shared schemas in
// @hufra/contracts that the mobile app and admin panel are built against.
// Public report schemas are strict, so a leaked private field (like the
// reporter's phone number) fails here.
import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const FIX = path.resolve(__dirname, '../fixtures/photos')

let t: TestEnv
let citizen: { token: string; id: number }
let admin: { token: string }
let reportId: number
let guestReportId: number

const H = (token?: string): Record<string, string> => ({
  'Content-Type': 'application/json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
})
const get = (p: string, token?: string) => request(t.env, p, { headers: H(token) })
const post = (p: string, body: unknown, token?: string) =>
  request(t.env, p, { method: 'POST', headers: H(token), body: JSON.stringify(body) })

/** Parse with a contract schema; on failure, show exactly which field broke the contract. */
async function expectContract<S extends z.ZodType>(res: Response, schema: S, status = 200): Promise<z.infer<S>> {
  expect(res.status).toBe(status)
  const body = await json(res)
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new Error(`Response does not match the contract:\n${JSON.stringify(parsed.error.issues, null, 2)}\nbody: ${JSON.stringify(body).slice(0, 600)}`)
  }
  return parsed.data
}

async function account(email: string, role?: 'admin') {
  await post('/api/auth/register', { email, password: PW, consent: true, display_name: 'Test' })
  if (role) await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const body = await json(await post('/api/auth/login', { email, password: PW }))
  return { token: body.access_token as string, id: body.user.id as number }
}

beforeAll(async () => {
  t = createTestEnv()
  citizen = await account('citizen@example.com')
  admin = await account('admin@example.com', 'admin')

  // A citizen report with a phone number and a photo, moved through statuses.
  const created = await json(
    await post(
      '/api/potholes',
      { lat: 32.8811, lng: 13.3502, severity: 'severe', street_ar: 'شارع', reporter_contact: '+218 91 000 0000', client_report_uuid: 'device-123456' },
      citizen.token
    )
  )
  reportId = created.id
  const fd = new FormData()
  fd.append('full', new File([fs.readFileSync(path.join(FIX, 'full.webp'))], 'p', { type: 'image/webp' }))
  fd.append('thumb', new File([fs.readFileSync(path.join(FIX, 'thumb.webp'))], 't', { type: 'image/webp' }))
  fd.append('upload_token', created.upload_token)
  await request(t.env, `/api/photos/${reportId}`, { method: 'POST', body: fd })
  for (const status of ['verified', 'under_repair', 'fixed']) {
    await request(t.env, `/api/potholes/${reportId}/status`, { method: 'PATCH', headers: H(admin.token), body: JSON.stringify({ status }) })
  }
  guestReportId = (await json(await post('/api/potholes', { lat: 32.9, lng: 13.2, severity: 'minor' }))).id
})

describe('public endpoints (anonymous)', () => {
  it('GET /api/regions', async () => {
    const body = await expectContract(await get('/api/regions'), C.regionListResponseSchema)
    expect(body.results.length).toBeGreaterThan(0)
  })

  it('GET /api/potholes: strict public list, no reporter fields', async () => {
    const body = await expectContract(await get('/api/potholes'), C.publicPotholeListResponseSchema)
    expect(body.results.map((r) => r.id)).toEqual(expect.arrayContaining([reportId, guestReportId]))
  })

  it('GET /api/potholes near me: rows carry distance_m', async () => {
    const body = await expectContract(await get('/api/potholes?near_lat=32.8811&near_lng=13.3502&radius_m=500'), C.publicPotholeListResponseSchema)
    expect(body.results[0].distance_m).toBeTypeOf('number')
  })

  it('GET /api/potholes/:id: strict public detail with photos and history', async () => {
    const body = await expectContract(await get(`/api/potholes/${reportId}`), C.publicPotholeDetailResponseSchema)
    expect(body.photos).toHaveLength(1)
    expect(body.history.map((h) => h.to_status)).toEqual(['reported', 'verified', 'under_repair', 'fixed'])
  })

  it('homepage and transparency endpoints', async () => {
    await expectContract(await get('/api/potholes/counters'), C.countersResponseSchema)
    const showcase = await expectContract(await get('/api/potholes/showcase'), C.showcaseResponseSchema)
    expect(showcase.fixed.map((s) => s.id)).toContain(reportId)
    await expectContract(await get('/api/potholes/recent-fixed'), C.recentFixedResponseSchema)
    await expectContract(await get('/api/potholes/top-reporter'), C.topReporterResponseSchema)
    await expectContract(await get('/api/donors/top'), C.topDonorResponseSchema)
  })

  it('counters on an empty database (SUM() is NULL)', async () => {
    const empty = createTestEnv()
    const res = await request(empty.env, '/api/potholes/counters')
    expect(C.countersResponseSchema.safeParse(await json(res)).success).toBe(true)
  })

  it('errors have the shared error shape', async () => {
    await expectContract(await get('/api/potholes/999999'), C.errorResponseSchema, 404)
    await expectContract(await post('/api/potholes', { lat: 'x' }), C.errorResponseSchema, 400)
  })
})

describe('citizen endpoints', () => {
  it('register, login (API client gets tokens), me, refresh', async () => {
    await expectContract(await post('/api/auth/register', { email: 'new@example.com', password: PW, consent: true }), C.registerResponseSchema, 201)
    const login = await expectContract(await post('/api/auth/login', { email: 'new@example.com', password: PW }), C.loginResponseSchema)
    expect(login.access_token && login.refresh_token).toBeTruthy()
    await expectContract(await get('/api/auth/me', login.access_token), C.meResponseSchema)
    const refreshed = await expectContract(
      await request(t.env, '/api/auth/refresh', { method: 'POST', headers: { 'X-Refresh-Token': login.refresh_token! } }),
      C.refreshResponseSchema
    )
    expect('access_token' in refreshed).toBe(true)
  })

  it('a web page login gets no tokens in the body (cookies only), still matching the contract', async () => {
    const res = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'http://localhost' },
      body: JSON.stringify({ email: 'citizen@example.com', password: PW }),
    })
    const body = await expectContract(res, C.loginResponseSchema)
    expect(body.access_token).toBeUndefined()
  })

  it('create report, upload photo, upvote, my reports, notifications', async () => {
    const created = await expectContract(await post('/api/potholes', { lat: 32.85, lng: 13.25, severity: 'medium' }, citizen.token), C.createPotholeResponseSchema, 201)
    const fd = new FormData()
    fd.append('full', new File([fs.readFileSync(path.join(FIX, 'full.jpg'))], 'p', { type: 'image/jpeg' }))
    fd.append('thumb', new File([fs.readFileSync(path.join(FIX, 'thumb.jpg'))], 't', { type: 'image/jpeg' }))
    fd.append('upload_token', created.upload_token)
    await expectContract(await request(t.env, `/api/photos/${created.id}`, { method: 'POST', body: fd }), C.photoUploadResponseSchema, 201)

    await expectContract(await post(`/api/potholes/${guestReportId}/upvote`, {}, citizen.token), C.upvoteResponseSchema, 201)

    const mine = await expectContract(await get('/api/potholes/mine/list', citizen.token), C.myPotholesResponseSchema)
    // The reporter sees their own contact number; nobody else does.
    expect(mine.results.find((r) => r.id === reportId)?.reporter_contact).toBe('+218 91 000 0000')

    const notes = await expectContract(await get('/api/notifications', citizen.token), C.notificationListResponseSchema)
    expect(notes.results.some((n) => n.type === 'status_change')).toBe(true)
  })

  it('offline re-send returns the same report (deduplicated)', async () => {
    const again = await expectContract(
      await post('/api/potholes', { lat: 32.8811, lng: 13.3502, severity: 'severe', client_report_uuid: 'device-123456' }, citizen.token),
      C.createPotholeResponseSchema
    )
    expect(again).toMatchObject({ id: reportId, deduplicated: true })
  })
})

describe('admin endpoints', () => {
  it('report detail and list include the private fields for admins', async () => {
    const detail = await expectContract(await get(`/api/potholes/${reportId}`, admin.token), C.adminPotholeDetailResponseSchema)
    expect(detail.pothole.reporter_contact).toBe('+218 91 000 0000')
    const list = await expectContract(await get('/api/potholes', admin.token), C.potholeListResponseSchema)
    expect(list.results.length).toBeGreaterThan(0)
  })

  it('the PUBLIC schema rejects an admin response (it would catch a leak)', async () => {
    const body = await json(await get(`/api/potholes/${reportId}`, admin.token))
    const parsed = C.publicPotholeDetailResponseSchema.safeParse(body)
    expect(parsed.success).toBe(false)
    expect(JSON.stringify(parsed.error?.issues)).toMatch(/reporter_contact|reporter_id|client_report_uuid/)
  })

  it('status change and admin notifications', async () => {
    const res = await request(t.env, `/api/potholes/${guestReportId}/status`, {
      method: 'PATCH',
      headers: H(admin.token),
      body: JSON.stringify({ status: 'verified' }),
    })
    await expectContract(res, C.statusChangeResponseSchema)
    const notes = await expectContract(await get('/api/admin/notifications', admin.token), C.notificationListResponseSchema)
    expect(notes.results.some((n) => n.type === 'new_report')).toBe(true)
  })
})
