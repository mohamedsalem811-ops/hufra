// Integration test: registration -> login -> admin-protected route.
//
// NOTE: this file used to be the primary regression suite for the mandatory
// admin-2FA bootstrap flow. Mandatory 2FA was CANCELLED per explicit user
// request (see docs/SECURITY.md for rationale) - /login no longer checks
// totp_enabled/totp_code for admin/super_admin roles, and the /2fa/setup,
// /2fa/verify routes were removed. What remains here is the still-valid
// regression coverage for the two real bugs originally found alongside that
// flow, rewritten against the simplified (2FA-free) login:
//
//  Bug #3: src/routes/auth.ts never wired the `attachAuth` middleware onto
//  its router, so c.get('auth') was always null/undefined regardless of a
//  valid Bearer token or cookie - every requireAuth() route (/me, /me/export,
//  /me/delete) always returned 401. Fixed by adding `auth.use('*', attachAuth)`.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function registerAndPromoteToAdmin(env: TestEnv['env'], email: string) {
  const res = await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  expect(res.status).toBe(201)
  await (env.DB as any).prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run()
}

describe('regular user auth', () => {
  it('registers, then GET /api/auth/me works with the returned session cookie (regression for Bug #3)', async () => {
    const email = 'plain-user@example.com'
    await request(t.env, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
    })
    const loginRes = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
    })
    expect(loginRes.status).toBe(200)
    const { access_token } = await json(loginRes)

    // Before the Bug #3 fix, this ALWAYS returned 401 regardless of a valid
    // access token, because auth.ts never wired attachAuth.
    const meRes = await request(t.env, '/api/auth/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    expect(meRes.status).toBe(200)
    const me = await json(meRes)
    expect(me.user.email).toBe(email)
  })

  it('login returns a usable access token without any 2FA challenge', async () => {
    const email = 'plain-user-2@example.com'
    await request(t.env, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
    })
    const loginRes = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
    })
    expect(loginRes.status).toBe(200)
    const body = await json(loginRes)
    expect(body.access_token).toBeTruthy()
    expect(body.requires_totp).toBeUndefined()
    expect(body.requires_totp_setup).toBeUndefined()
  })
})

describe('admin login (2FA cancelled)', () => {
  it('an admin account logs in directly with email + password, reaching a 200 with a real access token (no 403/setup_token challenge)', async () => {
    await registerAndPromoteToAdmin(t.env, 'new-admin@example.com')

    const res = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'new-admin@example.com', password: 'Str0ngP@ssw0rd!' }),
    })

    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.access_token).toBeTruthy()
    expect(body.requires_totp_setup).toBeUndefined()
    expect(body.setup_token).toBeUndefined()
  })

  it('the access token from an admin login reaches an admin-protected route', async () => {
    await registerAndPromoteToAdmin(t.env, 'full-flow-admin@example.com')

    const loginRes = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'full-flow-admin@example.com', password: 'Str0ngP@ssw0rd!' }),
    })
    expect(loginRes.status).toBe(200)
    const { access_token } = await json(loginRes)
    expect(access_token).toBeTruthy()

    const analyticsRes = await request(t.env, '/api/admin/analytics', {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    expect(analyticsRes.status).toBe(200)
  })

  it('the /2fa/setup and /2fa/verify routes no longer exist', async () => {
    await registerAndPromoteToAdmin(t.env, 'no-2fa-routes-admin@example.com')
    const loginRes = await json(
      await request(t.env, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'no-2fa-routes-admin@example.com', password: 'Str0ngP@ssw0rd!' }),
      })
    )
    const setupRes = await request(t.env, '/api/auth/2fa/setup', {
      method: 'POST',
      headers: { Authorization: `Bearer ${loginRes.access_token}` },
    })
    expect(setupRes.status).toBe(404)
  })
})

describe('RBAC boundary: admin vs super_admin', () => {
  it('a plain "admin" cannot reach a super_admin-only route', async () => {
    await registerAndPromoteToAdmin(t.env, 'rbac-admin@example.com')
    const loginRes = await json(
      await request(t.env, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'rbac-admin@example.com', password: 'Str0ngP@ssw0rd!' }),
      })
    )

    const res = await request(t.env, '/api/admin/audit-logs', {
      headers: { Authorization: `Bearer ${loginRes.access_token}` },
    })
    expect(res.status).toBe(403)
  })
})
