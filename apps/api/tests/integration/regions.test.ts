// Integration tests for /api/regions (public list + admin create/update).
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function enrolledAdmin(env: TestEnv['env'], email: string) {
  await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  await (env.DB as any).prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run()
  const login = await json(
    await request(env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
    })
  )
  return login.access_token as string
}

describe('GET /api/regions', () => {
  it('returns all 17 seeded active regions by default', async () => {
    const body = await json(await request(t.env, '/api/regions'))
    expect(body.results.length).toBe(17)
    expect(body.results.every((r: any) => r.active === 1)).toBe(true)
  })

  it('excludes inactive regions unless ?all=1 is passed', async () => {
    await t.db.prepare(`UPDATE regions SET active = 0 WHERE slug = 'tajoura'`).run()

    const activeOnly = await json(await request(t.env, '/api/regions'))
    expect(activeOnly.results.some((r: any) => r.slug === 'tajoura')).toBe(false)

    const all = await json(await request(t.env, '/api/regions?all=1'))
    expect(all.results.some((r: any) => r.slug === 'tajoura')).toBe(true)
    expect(all.results.length).toBe(17)
  })
})

describe('POST /api/regions (admin only)', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(t.env, '/api/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: 'new-region', name_ar: 'منطقة جديدة', name_en: 'New Region', center_lat: 32.9, center_lng: 13.2 }),
    })
    expect(res.status).toBe(401)
  })

  it('an enrolled admin can create a new region', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin@example.com')
    const res = await request(t.env, '/api/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: 'new-region', name_ar: 'منطقة جديدة', name_en: 'New Region', center_lat: 32.9, center_lng: 13.2 }),
    })
    expect(res.status).toBe(201)
    const body = await json(res)
    expect(typeof body.id).toBe('number')

    const all = await json(await request(t.env, '/api/regions?all=1'))
    expect(all.results.length).toBe(18)
  })

  it('rejects a duplicate slug with 409', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin-2@example.com')
    const res = await request(t.env, '/api/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: 'tajoura', name_ar: 'تاجوراء', name_en: 'Tajoura', center_lat: 32.8811, center_lng: 13.3502 }),
    })
    expect(res.status).toBe(409)
  })

  it('rejects invalid input (bad slug format)', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin-3@example.com')
    const res = await request(t.env, '/api/regions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ slug: 'Not A Valid Slug!', name_ar: 'x', name_en: 'x', center_lat: 32.9, center_lng: 13.2 }),
    })
    expect(res.status).toBe(400)
  })
})

describe('PATCH /api/regions/:id (admin only)', () => {
  it('updates only the provided fields, leaving others unchanged', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin-4@example.com')
    const region = await t.db.prepare('SELECT * FROM regions WHERE slug = ?').bind('tajoura').first<any>()

    const res = await request(t.env, `/api/regions/${region.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active: false }),
    })
    expect(res.status).toBe(200)

    const updated = await t.db.prepare('SELECT * FROM regions WHERE id = ?').bind(region.id).first<any>()
    expect(updated.active).toBe(0)
    expect(updated.name_ar).toBe(region.name_ar) // unchanged
    expect(updated.center_lat).toBe(region.center_lat) // unchanged
  })

  it('404s for a nonexistent region id', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin-5@example.com')
    const res = await request(t.env, '/api/regions/999999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ active: false }),
    })
    expect(res.status).toBe(404)
  })

  it('records an audit log entry with before/after snapshots', async () => {
    const token = await enrolledAdmin(t.env, 'region-admin-6@example.com')
    const region = await t.db.prepare('SELECT * FROM regions WHERE slug = ?').bind('tajoura').first<any>()

    await request(t.env, `/api/regions/${region.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name_en: 'Tajoura Updated' }),
    })

    const audit = await t.db.prepare(`SELECT * FROM audit_logs WHERE action = 'region.update'`).first<any>()
    expect(audit).not.toBeNull()
    expect(JSON.parse(audit.after_json)).toMatchObject({ name_en: 'Tajoura Updated' })
  })
})
