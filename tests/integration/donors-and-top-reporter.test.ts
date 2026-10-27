// Integration tests for:
//  - /api/donors/* (manual donor ledger - no real payment processing,
//    see migrations/0005_donors.sql for the assumption note)
//  - GET /api/potholes/top-reporter (auto-computed from registered users'
//    reports; anonymous/guest reports are excluded since they can't be
//    attributed to anyone)
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

async function enrolledUser(env: TestEnv['env'], email: string) {
  await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  const login = await json(
    await request(env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
    })
  )
  return login.access_token as string
}

async function createReport(env: TestEnv['env'], token?: string, overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await request(env, '/api/potholes', {
    method: 'POST',
    headers,
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium', ...overrides }),
  })
  return (await json(res)).id as number
}

describe('GET /api/donors/top (public)', () => {
  it('returns null when no donor has been recorded yet', async () => {
    const body = await json(await request(t.env, '/api/donors/top'))
    expect(body.donor).toBeNull()
  })

  it('returns the highest-amount donor', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin@example.com')
    await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
    })
    await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Sara', amount_lyd: 2000, note: 'Monthly supporter' }),
    })

    const body = await json(await request(t.env, '/api/donors/top'))
    expect(body.donor.name).toBe('Sara')
    expect(body.donor.amount_lyd).toBe(2000)
  })
})

describe('POST /api/donors (admin only)', () => {
  it('rejects unauthenticated requests', async () => {
    const res = await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a plain (non-admin) authenticated user', async () => {
    const token = await enrolledUser(t.env, 'plain-user@example.com')
    const res = await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
    })
    expect(res.status).toBe(403)
  })

  it('rejects invalid input (non-positive amount)', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin-2@example.com')
    const res = await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Ali', amount_lyd: -5 }),
    })
    expect(res.status).toBe(400)
  })

  it('records an audit log entry', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin-3@example.com')
    await request(t.env, '/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
    })
    const audit = await t.db.prepare(`SELECT * FROM audit_logs WHERE action = 'donor.create'`).first<any>()
    expect(audit).not.toBeNull()
  })
})

describe('PATCH/DELETE /api/donors/:id (admin only)', () => {
  it('updates a donor entry, leaving other fields unchanged', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin-4@example.com')
    const createRes = await json(
      await request(t.env, '/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
      })
    )

    await request(t.env, `/api/donors/${createRes.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount_lyd: 750 }),
    })

    const updated = await t.db.prepare('SELECT * FROM donors WHERE id = ?').bind(createRes.id).first<any>()
    expect(updated.amount_lyd).toBe(750)
    expect(updated.name).toBe('Ali') // unchanged
  })

  it('soft-deletes a donor entry so it no longer appears as top donor', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin-5@example.com')
    const createRes = await json(
      await request(t.env, '/api/donors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: 'Ali', amount_lyd: 500 }),
      })
    )

    const del = await request(t.env, `/api/donors/${createRes.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(del.status).toBe(200)

    const top = await json(await request(t.env, '/api/donors/top'))
    expect(top.donor).toBeNull()
  })

  it('404s for a nonexistent donor id', async () => {
    const token = await enrolledAdmin(t.env, 'donor-admin-6@example.com')
    const res = await request(t.env, '/api/donors/999999', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ amount_lyd: 100 }),
    })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/potholes/top-reporter (public)', () => {
  it('returns null when no registered user has any report', async () => {
    // Guest/anonymous reports only - can't be attributed to anyone.
    await createReport(t.env)
    const body = await json(await request(t.env, '/api/potholes/top-reporter'))
    expect(body.reporter).toBeNull()
  })

  it('returns the registered user with the most reports, using display_name when set', async () => {
    const aliceToken = await enrolledUser(t.env, 'alice@example.com')
    const bobToken = await enrolledUser(t.env, 'bob@example.com')

    await createReport(t.env, aliceToken)
    await createReport(t.env, aliceToken, { lat: 32.9, lng: 13.2 })
    await createReport(t.env, bobToken, { lat: 32.75, lng: 13.15 })

    await (t.env.DB as any).prepare(`UPDATE users SET display_name = ? WHERE email = ?`).bind('Alice A.', 'alice@example.com').run()

    const body = await json(await request(t.env, '/api/potholes/top-reporter'))
    expect(body.reporter.name).toBe('Alice A.')
    expect(body.reporter.report_count).toBe(2)
  })

  it('falls back to the user code when display_name is not set', async () => {
    const token = await enrolledUser(t.env, 'nocname@example.com')
    await createReport(t.env, token)

    const body = await json(await request(t.env, '/api/potholes/top-reporter'))
    expect(body.reporter.name).toMatch(/^LBY/)
  })
})
