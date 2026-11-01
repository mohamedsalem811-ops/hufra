// Integration tests for /api/admin/* (notifications, duplicates, analytics,
// reports queue, audit-logs, admin management) through the real Hono app.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function enrolledAdmin(env: TestEnv['env'], email: string, role: 'admin' | 'super_admin' = 'admin') {
  await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  await (env.DB as any).prepare(`UPDATE users SET role = ? WHERE email = ?`).bind(role, email).run()
  const login = await json(
    await request(env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
    })
  )
  return login.access_token as string
}

async function createReport(env: TestEnv['env'], overrides: Record<string, unknown> = {}) {
  const res = await request(env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium', ...overrides }),
  })
  return (await json(res)).id as number
}

describe('/api/admin/* requires an authenticated admin', () => {
  it('rejects unauthenticated requests to every admin sub-route', async () => {
    for (const path of ['/api/admin/notifications', '/api/admin/duplicates', '/api/admin/analytics', '/api/admin/reports']) {
      const res = await request(t.env, path)
      expect(res.status).toBe(401)
    }
  })
})

describe('GET /api/admin/notifications', () => {
  it('lists admin-targeted notifications created by a new report, with an unread count', async () => {
    const token = await enrolledAdmin(t.env, 'notif-admin@example.com')
    await createReport(t.env)

    const res = await request(t.env, '/api/admin/notifications', { headers: { Authorization: `Bearer ${token}` } })
    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.results.length).toBeGreaterThanOrEqual(1)
    expect(body.unread_count).toBeGreaterThanOrEqual(1)
  })

  it('POST /notifications/read-all clears the unread count', async () => {
    const token = await enrolledAdmin(t.env, 'notif-admin-2@example.com')
    await createReport(t.env)

    await request(t.env, '/api/admin/notifications/read-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    })
    const body = await json(await request(t.env, '/api/admin/notifications', { headers: { Authorization: `Bearer ${token}` } }))
    expect(body.unread_count).toBe(0)
  })
})

describe('GET /api/admin/duplicates + PATCH /api/admin/duplicates/:id', () => {
  it('lists pending duplicate flags and confirming one soft-deletes the duplicate report', async () => {
    const token = await enrolledAdmin(t.env, 'dup-admin@example.com')
    await createReport(t.env, { lat: 32.8811, lng: 13.3502 })
    const dupId = await createReport(t.env, { lat: 32.88128, lng: 13.3502 })

    const listRes = await json(await request(t.env, '/api/admin/duplicates', { headers: { Authorization: `Bearer ${token}` } }))
    expect(listRes.results.length).toBe(1)
    const flagId = listRes.results[0].id

    const patchRes = await request(t.env, `/api/admin/duplicates/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision: 'confirmed' }),
    })
    expect(patchRes.status).toBe(200)

    const dupRow = await t.db.prepare('SELECT deleted_at FROM potholes WHERE id = ?').bind(dupId).first<{ deleted_at: string | null }>()
    expect(dupRow!.deleted_at).not.toBeNull()

    const listAfter = await json(await request(t.env, '/api/admin/duplicates', { headers: { Authorization: `Bearer ${token}` } }))
    expect(listAfter.results.length).toBe(0)
  })

  it('rejecting a duplicate flag leaves the flagged report intact', async () => {
    const token = await enrolledAdmin(t.env, 'dup-admin-2@example.com')
    await createReport(t.env, { lat: 32.8811, lng: 13.3502 })
    const dupId = await createReport(t.env, { lat: 32.88128, lng: 13.3502 })
    const listRes = await json(await request(t.env, '/api/admin/duplicates', { headers: { Authorization: `Bearer ${token}` } }))
    const flagId = listRes.results[0].id

    await request(t.env, `/api/admin/duplicates/${flagId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ decision: 'rejected' }),
    })

    const dupRow = await t.db.prepare('SELECT deleted_at FROM potholes WHERE id = ?').bind(dupId).first<{ deleted_at: string | null }>()
    expect(dupRow!.deleted_at).toBeNull()
  })
})

describe('GET /api/admin/analytics', () => {
  it('aggregates by_status, by_region, by_severity, by_month', async () => {
    const token = await enrolledAdmin(t.env, 'analytics-admin@example.com')
    await createReport(t.env, { severity: 'severe' })
    await createReport(t.env, { severity: 'minor' })

    const body = await json(await request(t.env, '/api/admin/analytics', { headers: { Authorization: `Bearer ${token}` } }))
    expect(body.by_status.find((r: any) => r.status === 'reported').n).toBe(2)
    expect(body.by_severity.some((r: any) => r.severity === 'severe')).toBe(true)
    expect(body.by_severity.some((r: any) => r.severity === 'minor')).toBe(true)
    expect(Array.isArray(body.by_region)).toBe(true)
    expect(Array.isArray(body.by_month)).toBe(true)
  })
})

describe('GET /api/admin/reports', () => {
  it('filters the reports queue by status and includes duplicate_flag_count', async () => {
    const token = await enrolledAdmin(t.env, 'reports-admin@example.com')
    const firstId = await createReport(t.env, { lat: 32.8811, lng: 13.3502 })
    // duplicate_flags.pothole_id is the NEW report (this one), duplicate_of_id
    // points back at firstId - so the flag count attaches to secondId here.
    const secondId = await createReport(t.env, { lat: 32.88128, lng: 13.3502 })

    const body = await json(await request(t.env, '/api/admin/reports?status=reported', { headers: { Authorization: `Bearer ${token}` } }))
    expect(body.results.length).toBe(2)
    const first = body.results.find((r: any) => r.id === firstId)
    const second = body.results.find((r: any) => r.id === secondId)
    expect(first.duplicate_flag_count).toBe(0)
    expect(second.duplicate_flag_count).toBe(1)
  })
})

describe('super_admin-only sub-routes', () => {
  it('GET /api/admin/audit-logs is 403 for a plain admin, 200 for super_admin', async () => {
    const adminToken = await enrolledAdmin(t.env, 'plain-admin@example.com', 'admin')
    const forbidden = await request(t.env, '/api/admin/audit-logs', { headers: { Authorization: `Bearer ${adminToken}` } })
    expect(forbidden.status).toBe(403)

    const superToken = await enrolledAdmin(t.env, 'super-admin@example.com', 'super_admin')
    const allowed = await request(t.env, '/api/admin/audit-logs', { headers: { Authorization: `Bearer ${superToken}` } })
    expect(allowed.status).toBe(200)
    const body = await json(allowed)
    expect(Array.isArray(body.results)).toBe(true)
  })

  it('GET /api/admin/admins lists admin/super_admin accounts (super_admin only)', async () => {
    await enrolledAdmin(t.env, 'plain-admin-2@example.com', 'admin')
    const superToken = await enrolledAdmin(t.env, 'super-admin-2@example.com', 'super_admin')

    const body = await json(await request(t.env, '/api/admin/admins', { headers: { Authorization: `Bearer ${superToken}` } }))
    const emails = body.results.map((u: any) => u.email)
    expect(emails).toContain('plain-admin-2@example.com')
    expect(emails).toContain('super-admin-2@example.com')
  })

  it('POST /api/admin/admins/promote upgrades a user role and records an audit entry', async () => {
    const superToken = await enrolledAdmin(t.env, 'promoter@example.com', 'super_admin')
    await request(t.env, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'promotee@example.com', password: 'Str0ngP@ssw0rd!', consent: true }),
    })

    const res = await request(t.env, '/api/admin/admins/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ email: 'promotee@example.com', role: 'admin' }),
    })
    expect(res.status).toBe(200)

    const row = await t.db.prepare('SELECT role FROM users WHERE email = ?').bind('promotee@example.com').first<{ role: string }>()
    expect(row!.role).toBe('admin')

    const audit = await t.db.prepare(`SELECT * FROM audit_logs WHERE action = 'user.promote'`).all()
    expect(audit.results.length).toBe(1)
  })

  it('POST /api/admin/admins/promote 404s for a nonexistent email', async () => {
    const superToken = await enrolledAdmin(t.env, 'promoter-2@example.com', 'super_admin')
    const res = await request(t.env, '/api/admin/admins/promote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${superToken}` },
      body: JSON.stringify({ email: 'nobody@example.com', role: 'admin' }),
    })
    expect(res.status).toBe(404)
  })
})
