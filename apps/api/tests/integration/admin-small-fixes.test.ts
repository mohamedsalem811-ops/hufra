// Notifications for super admins, per-person read state, one-time duplicate
// review, and case-insensitive promote/demote.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv
beforeEach(() => {
  t = createTestEnv()
})

async function account(email: string, role: 'user' | 'admin' | 'super_admin') {
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

const H = (tok: string) => ({ Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' })
const get = async (path: string, tok: string) => json(await request(t.env, path, { headers: H(tok) }))
const report = async (lat = 32.8811) =>
  (await json(await request(t.env, '/api/potholes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ lat, lng: 13.3502, severity: 'medium' }) }))).id as number

describe('admin notifications', () => {
  it('super admins see new-report alerts on the admin page too', async () => {
    const root = await account('root@example.com', 'super_admin')
    await report()
    for (const path of ['/api/admin/notifications', '/api/notifications']) {
      const body = await get(path, root)
      expect(body.results.map((n: any) => n.type)).toContain('new_report')
      expect(body.unread_count).toBe(1)
    }
  })

  it('one admin marking all read does not hide them for the other admins', async () => {
    const a = await account('a@example.com', 'admin')
    const b = await account('b@example.com', 'admin')
    await report()
    await request(t.env, '/api/admin/notifications/read-all', { method: 'POST', headers: H(a) })
    expect((await get('/api/admin/notifications', a)).unread_count).toBe(0)
    expect((await get('/api/admin/notifications', b)).unread_count).toBe(1)
    expect((await get('/api/notifications', b)).results[0].read_at).toBeNull()
    await report(32.9)
    expect((await get('/api/notifications', a)).unread_count).toBe(1) // the new one
  })

  it('citizens only see their own notifications', async () => {
    const citizen = await account('c@example.com', 'user')
    await report()
    const body = await get('/api/notifications', citizen)
    expect(body.results).toEqual([])
    expect(body.unread_count).toBe(0)
  })
})

describe('duplicate review', () => {
  async function flag() {
    const original = await report(32.8811)
    const dup = await report(32.88128) // ~20 m away
    const admin = await account('dup@example.com', 'admin')
    const flags = await get('/api/admin/duplicates', admin)
    return { original, dup, admin, flagId: flags.results[0].id as number }
  }
  const review = (id: number | string, decision: string, tok: string) =>
    request(t.env, `/api/admin/duplicates/${id}`, { method: 'PATCH', headers: H(tok), body: JSON.stringify({ decision }) })

  it('can be applied only once', async () => {
    const { dup, admin, flagId } = await flag()
    expect((await review(flagId, 'rejected', admin)).status).toBe(200)
    const second = await review(flagId, 'confirmed', admin)
    expect(second.status).toBe(409)
    const r = await t.db.prepare('SELECT deleted_at FROM potholes WHERE id = ?').bind(dup).first<any>()
    expect(r.deleted_at).toBeNull() // the late "confirm" did not delete it
  })

  it('refuses flags whose report was already deleted, and hides them from the list', async () => {
    const { dup, admin, flagId } = await flag()
    await request(t.env, `/api/potholes/${dup}`, { method: 'DELETE', headers: H(admin) })
    expect((await get('/api/admin/duplicates', admin)).results).toEqual([])
    expect((await review(flagId, 'confirmed', admin)).status).toBe(409)
  })

  it('confirming deletes only the newer duplicate and is audited', async () => {
    const { original, dup, admin, flagId } = await flag()
    const res = await review(flagId, 'confirmed', admin)
    expect(await json(res)).toMatchObject({ ok: true, deleted_report_id: dup })
    const rows = await t.db.prepare('SELECT id, deleted_at FROM potholes WHERE id IN (?, ?) ORDER BY id').bind(original, dup).all<any>()
    expect(rows.results.map((r: any) => !!r.deleted_at)).toEqual([false, true])
    const audit = await t.db.prepare(`SELECT before_json FROM audit_logs WHERE action = 'duplicate.review'`).first<any>()
    expect(JSON.parse(audit.before_json)).toMatchObject({ review_status: 'pending', pothole_id: dup })
  })

  it('validates the id', async () => {
    const admin = await account('x@example.com', 'admin')
    expect((await review('abc', 'confirmed', admin)).status).toBe(400)
    expect((await review(999, 'confirmed', admin)).status).toBe(404)
  })
})

describe('promote / demote', () => {
  it('accept the email in any letter case', async () => {
    const root = await account('root@example.com', 'super_admin')
    await account('staff@example.com', 'user')
    const promote = await request(t.env, '/api/admin/admins/promote', {
      method: 'POST',
      headers: H(root),
      body: JSON.stringify({ email: '  Staff@Example.COM ', role: 'admin' }),
    })
    expect(promote.status).toBe(200)
    let row = await t.db.prepare(`SELECT role FROM users WHERE email = 'staff@example.com'`).first<any>()
    expect(row.role).toBe('admin')

    const demote = await request(t.env, '/api/admin/admins/demote', {
      method: 'POST',
      headers: H(root),
      body: JSON.stringify({ email: 'STAFF@example.com' }),
    })
    expect(demote.status).toBe(200)
    row = await t.db.prepare(`SELECT role FROM users WHERE email = 'staff@example.com'`).first<any>()
    expect(row.role).toBe('user')
  })
})
