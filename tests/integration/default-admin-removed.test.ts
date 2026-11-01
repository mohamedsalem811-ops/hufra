// The old default super admin (admin@hufra.ly / Hufra@Admin2026!) was public in
// the repository and the login route re-created it on demand. These tests pin
// down that the backdoor is gone and that the published password is unusable.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'
import { hashPassword, verifyPassword } from '../../src/lib/password'
// @ts-expect-error - plain .mjs script without type declarations
import { hashPasswordNode, validateAdminPassword, buildSetAdminSql } from '../../scripts/set-admin-password.mjs'

const PUBLIC_PW = 'Hufra@Admin2026!'
let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

function post(path: string, body: unknown, headers: Record<string, string> = {}) {
  return request(t.env, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

describe('default admin backdoor', () => {
  it('migration 0007 disables the seeded admin@hufra.ly password', async () => {
    const res = await post('/api/auth/login', { email: 'admin@hufra.ly', password: PUBLIC_PW })
    expect(res.status).toBe(401)
    const row = await t.db
      .prepare(`SELECT password_hash FROM users WHERE email = 'admin@hufra.ly'`)
      .first<{ password_hash: string }>()
    expect(row?.password_hash.startsWith('pbkdf2$')).toBe(false)
  })

  it('no longer re-creates a super admin when the account is missing', async () => {
    await t.db.prepare(`DELETE FROM users WHERE email = 'admin@hufra.ly'`).run()
    const res = await post('/api/auth/login', { email: 'admin@hufra.ly', password: PUBLIC_PW })
    expect(res.status).toBe(401)
    const n = await t.db.prepare(`SELECT COUNT(*) AS n FROM users WHERE email = 'admin@hufra.ly'`).first<{ n: number }>()
    expect(n?.n).toBe(0)
  })

  it('refuses the published password even when it matches the stored hash', async () => {
    // e.g. a deployment where the old login code re-hashed it with a random salt
    await t.db
      .prepare(`UPDATE users SET password_hash = ? WHERE email = 'admin@hufra.ly'`)
      .bind(await hashPassword(PUBLIC_PW))
      .run()
    const res = await post('/api/auth/login', { email: 'admin@hufra.ly', password: PUBLIC_PW })
    expect(res.status).toBe(403)
    const body = await json(res)
    expect(body.access_token).toBeUndefined()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('does not let anyone register with or change to the published password', async () => {
    const reg = await post('/api/auth/register', { email: 'x@example.com', password: PUBLIC_PW, consent: true })
    expect(reg.status).toBe(400)

    await post('/api/auth/register', { email: 'y@example.com', password: 'Str0ngP@ssw0rd!', consent: true })
    const login = await json(await post('/api/auth/login', { email: 'y@example.com', password: 'Str0ngP@ssw0rd!' }))
    const change = await post(
      '/api/auth/change-password',
      { current_password: 'Str0ngP@ssw0rd!', new_password: PUBLIC_PW },
      { Authorization: `Bearer ${login.access_token}` }
    )
    expect(change.status).toBe(400)
    expect((await json(change)).error).toMatch(/publicly known/)
  })
})

describe('scripts/set-admin-password.mjs', () => {
  it('produces hashes the Worker can verify', async () => {
    const hash = hashPasswordNode('a-long-admin-passphrase')
    expect(await verifyPassword('a-long-admin-passphrase', hash)).toBe(true)
    expect(await verifyPassword('wrong', hash)).toBe(false)
  })

  it('rejects short and published passwords', () => {
    expect(validateAdminPassword('short')).toMatch(/12/)
    expect(validateAdminPassword(PUBLIC_PW)).toMatch(/publicly known/)
    expect(validateAdminPassword('a-long-admin-passphrase')).toBeNull()
  })

  it('creates a working super admin and signs out its old sessions', async () => {
    const sql: string = buildSetAdminSql('owner@example.com', hashPasswordNode('a-long-admin-passphrase'))
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) await t.db.prepare(stmt).run()

    const first = await json(await post('/api/auth/login', { email: 'owner@example.com', password: 'a-long-admin-passphrase' }))
    expect(first.user.role).toBe('super_admin')

    // Resetting the password revokes the refresh token issued above
    const sql2: string = buildSetAdminSql('owner@example.com', hashPasswordNode('another-long-passphrase'))
    for (const stmt of sql2.split(';').map((s) => s.trim()).filter(Boolean)) await t.db.prepare(stmt).run()
    const refresh = await post('/api/auth/refresh', {}, { 'X-Refresh-Token': first.refresh_token })
    expect(refresh.status).toBe(401)
    const second = await post('/api/auth/login', { email: 'owner@example.com', password: 'another-long-passphrase' })
    expect(second.status).toBe(200)
  })

  it('refuses emails that could break out of the SQL string', () => {
    expect(() => buildSetAdminSql("a'@x.com", hashPasswordNode('a-long-admin-passphrase'))).toThrow()
  })
})
