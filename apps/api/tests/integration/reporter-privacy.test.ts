// Reporters' phone numbers (reporter_contact) and account links (reporter_id)
// used to be returned by the public report API to anyone. Only admins may see them.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const PHONE = '+218 91 123 4567'
const PRIVATE = ['reporter_contact', 'reporter_id', 'client_report_uuid']
let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function tokenFor(email: string, role: 'user' | 'admin' | 'super_admin' = 'user') {
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, consent: true }),
  })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const res = await request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  return (await json(res)).access_token as string
}

async function createReport(reporterToken?: string) {
  const res = await request(t.env, '/api/potholes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(reporterToken ? { Authorization: `Bearer ${reporterToken}` } : {}),
    },
    body: JSON.stringify({
      lat: 32.8811,
      lng: 13.3502,
      severity: 'severe',
      reporter_contact: PHONE,
      client_report_uuid: 'device-uuid-12345',
    }),
  })
  expect(res.status).toBe(201)
  return (await json(res)).id as number
}

const get = (path: string, token?: string) =>
  request(t.env, path, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)

describe('reporter privacy on the public report API', () => {
  it('hides contact details from anonymous visitors (list, near-me and detail)', async () => {
    const reporter = await tokenFor('reporter@example.com')
    const id = await createReport(reporter)

    for (const path of ['/api/potholes', '/api/potholes?near_lat=32.8811&near_lng=13.3502', `/api/potholes/${id}`]) {
      const res = await get(path)
      expect(res.status).toBe(200)
      const text = await res.clone().text()
      expect(text).not.toContain(PHONE)
      const body = await json(res)
      const row = body.pothole ?? body.results[0]
      expect(row.id).toBe(id)
      for (const field of PRIVATE) expect(row).not.toHaveProperty(field)
    }
  })

  it('hides them from ordinary signed-in users too', async () => {
    const id = await createReport()
    const user = await tokenFor('someone@example.com')
    const body = await json(await get(`/api/potholes/${id}`, user))
    for (const field of PRIVATE) expect(body.pothole).not.toHaveProperty(field)
  })

  it('still gives admins the contact number, marked as non-cacheable', async () => {
    const id = await createReport()
    for (const role of ['admin', 'super_admin'] as const) {
      const admin = await tokenFor(`${role}@example.com`, role)
      const detail = await get(`/api/potholes/${id}`, admin)
      expect(detail.headers.get('cache-control')).toContain('no-store')
      expect((await json(detail)).pothole.reporter_contact).toBe(PHONE)
      const list = await json(await get('/api/potholes', admin))
      expect(list.results[0].reporter_contact).toBe(PHONE)
    }
  })

  it('public responses keep everything the map and detail pages need', async () => {
    const id = await createReport()
    const body = await json(await get(`/api/potholes/${id}`))
    for (const field of ['id', 'lat', 'lng', 'severity', 'status', 'region_name_ar', 'region_name_en', 'upvotes_count']) {
      expect(body.pothole).toHaveProperty(field)
    }
  })
})
