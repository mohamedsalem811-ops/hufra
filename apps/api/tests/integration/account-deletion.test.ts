// Deleting an account must erase the person's data, not just hide it.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const EMAIL = 'Person@Example.com'
const PHONE = '+218 92 555 0101'
let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

const post = (p: string, body?: unknown, token?: string) =>
  request(t.env, p, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

async function signUp(email = EMAIL, role: 'user' | 'super_admin' = 'user') {
  await post('/api/auth/register', { email, password: PW, consent: true, display_name: 'Fatima from Tajoura' })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email.toLowerCase()).run()
  return json(await post('/api/auth/login', { email, password: PW }))
}

describe('POST /api/auth/me/delete', () => {
  it('erases the personal data and keeps the public report', async () => {
    const login = await signUp()
    const tok = login.access_token
    const report = await json(await post('/api/potholes', { lat: 32.8811, lng: 13.3502, severity: 'severe', reporter_contact: PHONE }, tok))
    await post('/api/notifications/push-token', { platform: 'android', token: 'device-token-1234567890:APA91b' }, tok)

    expect((await post('/api/auth/me/delete', undefined, tok)).status).toBe(200)

    const user = await t.db.prepare('SELECT * FROM users WHERE id = ?').bind(login.user.id).first<any>()
    expect(user.email).toBe(`deleted-${user.id}@deleted.invalid`)
    expect(user.display_name).toBeNull()
    expect(user.password_hash).toBe('!deleted')
    expect(user.deleted_at).toBeTruthy()

    const pothole = await t.db.prepare('SELECT reporter_id, reporter_contact, deleted_at FROM potholes WHERE id = ?').bind(report.id).first<any>()
    expect(pothole).toEqual({ reporter_id: null, reporter_contact: null, deleted_at: null })

    const leftovers = await t.db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM device_push_tokens WHERE user_id = ?) AS devices,
                (SELECT COUNT(*) FROM notifications WHERE target_user_id = ?) AS notes,
                (SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND (revoked_at IS NULL OR user_agent IS NOT NULL OR ip_hash IS NOT NULL)) AS sessions`
      )
      .bind(user.id, user.id, user.id)
      .first<any>()
    expect(leftovers).toEqual({ devices: 0, notes: 0, sessions: 0 })

    // Nothing anywhere in the database still contains the email, name or phone number.
    const dump = JSON.stringify(
      ['users', 'potholes', 'audit_logs', 'refresh_tokens', 'notifications', 'device_push_tokens'].map((tbl) => t.db.raw.prepare(`SELECT * FROM ${tbl}`).all())
    ).toLowerCase()
    for (const secret of [EMAIL.toLowerCase(), 'fatima', PHONE]) expect(dump).not.toContain(secret.toLowerCase())
  })

  it('signs the person out everywhere and frees the email for a new account', async () => {
    const login = await signUp()
    await post('/api/auth/me/delete', undefined, login.access_token)
    expect((await post('/api/auth/refresh', { refresh_token: login.refresh_token })).status).toBe(401)
    expect((await post('/api/auth/login', { email: EMAIL, password: PW })).status).toBe(401)
    expect((await post('/api/auth/register', { email: EMAIL, password: PW, consent: true })).status).toBe(201)
  })

  it('refuses to delete the last super admin', async () => {
    await t.db.prepare(`UPDATE users SET role = 'user' WHERE email = 'admin@hufra.ly'`).run()
    const root = await signUp('root@example.com', 'super_admin')
    const res = await post('/api/auth/me/delete', undefined, root.access_token)
    expect(res.status).toBe(400)
    expect((await json(res)).error).toMatch(/last super admin/)

    await signUp('second@example.com', 'super_admin')
    expect((await post('/api/auth/me/delete', undefined, root.access_token)).status).toBe(200)
  })

  it('new reports no longer copy the phone number into the permanent audit log', async () => {
    await post('/api/potholes', { lat: 32.8811, lng: 13.3502, severity: 'minor', reporter_contact: PHONE })
    const row = await t.db.prepare(`SELECT after_json FROM audit_logs WHERE action = 'pothole.create'`).first<{ after_json: string }>()
    expect(row!.after_json).not.toContain(PHONE)
    expect(JSON.parse(row!.after_json).reporter_contact).toBe('[provided]')
  })
})

describe('migration 0009 cleans up accounts deleted before the fix', () => {
  it('anonymises old-style deleted rows', async () => {
    const login = await signUp()
    await post('/api/potholes', { lat: 32.8811, lng: 13.3502, severity: 'severe', reporter_contact: PHONE }, login.access_token)
    // What the previous code left behind:
    await t.db
      .prepare(`UPDATE users SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), email = email || '.deleted.' || id WHERE id = ?`)
      .bind(login.user.id)
      .run()

    const sql = fs.readFileSync(path.resolve(__dirname, '../../migrations/0009_anonymize_deleted_accounts.sql'), 'utf8')
    t.db.raw.exec(sql)

    const user = await t.db.prepare('SELECT email, display_name, password_hash FROM users WHERE id = ?').bind(login.user.id).first<any>()
    expect(user).toEqual({ email: `deleted-${login.user.id}@deleted.invalid`, display_name: null, password_hash: '!deleted' })
    const p = await t.db.prepare('SELECT reporter_contact FROM potholes WHERE reporter_id = ?').bind(login.user.id).first<any>()
    expect(p.reporter_contact).toBeNull()
    // Active accounts are untouched.
    const admin = await t.db.prepare(`SELECT email FROM users WHERE email = 'admin@hufra.ly'`).first()
    expect(admin).toBeTruthy()
  })
})
