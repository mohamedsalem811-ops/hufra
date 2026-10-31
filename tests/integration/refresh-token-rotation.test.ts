// Refresh tokens: only tokens the server issued and recorded are accepted,
// each one works once (rotation), and replaying a retired one signs the
// account out everywhere (theft detection).
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'
import { signJwt, nowSeconds } from '../../src/lib/jwt'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function login(email = 'user@example.com') {
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, consent: true }),
  })
  const res = await request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  return json(res)
}

const refresh = (token: string) =>
  request(t.env, '/api/auth/refresh', { method: 'POST', headers: { 'X-Refresh-Token': token } })

/** Pretend the token was rotated `seconds` ago (past the race grace period). */
async function ageRotation(seconds: number) {
  const at = new Date(Date.now() - seconds * 1000).toISOString()
  await t.db.prepare('UPDATE refresh_tokens SET replaced_at = ? WHERE replaced_at IS NOT NULL').bind(at).run()
}

describe('refresh token rotation', () => {
  it('rejects a validly signed refresh token that the server never recorded', async () => {
    const { user } = await login()
    const iat = nowSeconds()
    const forged = await signJwt(
      { sub: user.id, role: 'user', code: user.code, iat, exp: iat + 3600, typ: 'refresh', jti: 'never-stored' },
      t.env.JWT_SECRET
    )
    expect((await refresh(forged)).status).toBe(401)
  })

  it('issues a new refresh token on every use and retires the old one', async () => {
    const first = await login()
    const r1 = await refresh(first.refresh_token)
    expect(r1.status).toBe(200)
    const second = await json(r1)
    expect(second.refresh_token).not.toBe(first.refresh_token)
    expect(r1.headers.get('set-cookie')).toContain('hufra_refresh=')

    // The old one no longer works; the new one does.
    expect((await refresh(first.refresh_token)).status).toBe(401)
    expect((await refresh(second.refresh_token)).status).toBe(200)
  })

  it('a parallel refresh with the same token (two tabs) does not end the session', async () => {
    const first = await login()
    const [a, b] = await Promise.all([refresh(first.refresh_token), refresh(first.refresh_token)])
    expect([a.status, b.status].sort()).toEqual([200, 401])
    const winner = await json(a.status === 200 ? a : b)
    // The loser was inside the grace period, so the winner's new token still works.
    expect((await refresh(winner.refresh_token)).status).toBe(200)
  })

  it('replaying a retired token later signs out every session and is audited', async () => {
    const stolen = await login()
    const phoneSession = await login() // same account, second device
    const rotated = await json(await refresh(stolen.refresh_token)) // the real owner refreshes
    await ageRotation(120)

    const replay = await refresh(stolen.refresh_token) // attacker uses the copied token
    expect(replay.status).toBe(401)

    // Every session of the account is now dead, including the owner's new token and the other device.
    expect((await refresh(rotated.refresh_token)).status).toBe(401)
    expect((await refresh(phoneSession.refresh_token)).status).toBe(401)

    const audit = await t.db
      .prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'session.refresh_token_reuse'`)
      .first<{ n: number }>()
    expect(audit?.n).toBe(1)

    // Logging in again works normally.
    const res = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: PW }),
    })
    expect(res.status).toBe(200)
  })

  it('a token revoked by logout is refused without signing out other devices', async () => {
    const laptop = await login()
    const phone = await login()
    await request(t.env, '/api/auth/logout', { method: 'POST', headers: { 'X-Refresh-Token': laptop.refresh_token } })
    await ageRotation(120)
    expect((await refresh(laptop.refresh_token)).status).toBe(401)
    expect((await refresh(phone.refresh_token)).status).toBe(200)
  })

  it('two logins in the same second get different refresh tokens', async () => {
    const a = await login()
    const b = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: PW }),
    })
    expect((await json(b)).refresh_token).not.toBe(a.refresh_token)
  })

  it('logout clears cookies with the same Secure/SameSite attributes they were set with', async () => {
    const { refresh_token } = await login()
    const res = await request(t.env, 'https://hufra.test/api/auth/logout', {
      method: 'POST',
      headers: { 'X-Refresh-Token': refresh_token },
    })
    const cookies = res.headers.get('set-cookie') || ''
    expect(cookies).toContain('Max-Age=0')
    expect(cookies).toContain('SameSite=Lax')
    expect(cookies).toContain('Secure')
  })
})

describe('malformed access tokens', () => {
  it('are treated as "not logged in" (401), not a server error', async () => {
    for (const bad of ['broken.access.token', 'garbage', 'a.b.c']) {
      const res = await request(t.env, '/api/auth/me', { headers: { Authorization: `Bearer ${bad}` } })
      expect(res.status).toBe(401)
    }
  })
})
