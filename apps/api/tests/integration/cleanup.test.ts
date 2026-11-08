// Plan 9.1: the daily clean-up keeps the privacy policy's retention promises.
import { describe, it, expect, beforeEach } from 'vitest'
import { dailyCleanup } from '../../src/lib/cleanup'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv
const NOW = new Date('2026-11-08T03:17:00.000Z')
const ago = (days: number) => new Date(NOW.getTime() - days * 86_400_000).toISOString()
const H = { 'Content-Type': 'application/json' }

async function setup() {
  await request(t.env, '/api/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ email: 'd@example.com', password: PW, consent: true }) })
  const token = (await json(await request(t.env, '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email: 'd@example.com', password: PW }) }))).access_token
  const pothole = (await json(await request(t.env, '/api/potholes', { method: 'POST', headers: { ...H, Authorization: `Bearer ${token}` }, body: JSON.stringify({ lat: 32.88, lng: 13.19, severity: 'medium' }) }))).id
  const user = (await t.db.prepare(`SELECT id FROM users WHERE email = 'd@example.com'`).first<{ id: number }>())!.id
  const campaign = (await t.db.prepare(`INSERT INTO campaigns (pothole_id, status, target_millimes) VALUES (?, 'active', 500000) RETURNING id`).bind(pothole).first<{ id: number }>())!.id
  return { user, campaign }
}

async function donation(user: number, campaign: number, n: number, status: string, reviewedDaysAgo: number | null, updatedDaysAgo = 1) {
  const key = `proofs/${n}.webp`
  await t.photos.put(key, new TextEncoder().encode('img').buffer as ArrayBuffer)
  await t.db
    .prepare(
      `INSERT INTO donations (campaign_id, user_id, reference_code, amount_millimes, status, proof_key, proof_sha256, reviewed_at, updated_at)
       VALUES (?, ?, ?, 10000, ?, ?, ?, ?, ?)`
    )
    .bind(campaign, user, `HF-${n}`, status, key, `sha-${n}`, reviewedDaysAgo === null ? null : ago(reviewedDaysAgo), ago(updatedDaysAgo))
    .run()
  return key
}

beforeEach(() => {
  t = createTestEnv()
})

describe('daily clean-up', () => {
  it('deletes transfer screenshots after the retention period, keeping their hash and anything still under review', async () => {
    const { user, campaign } = await setup()
    const oldConfirmed = await donation(user, campaign, 1, 'confirmed', 91)
    const oldRejected = await donation(user, campaign, 2, 'rejected', 120)
    const recent = await donation(user, campaign, 3, 'confirmed', 10)
    const reviewing = await donation(user, campaign, 4, 'under_review', null, 200)
    const cancelled = await donation(user, campaign, 5, 'cancelled', null, 95)

    const result = await dailyCleanup(t.env, NOW)
    expect(result.screenshots).toBe(3)
    for (const key of [oldConfirmed, oldRejected, cancelled]) expect(await t.photos.get(key)).toBeNull()
    for (const key of [recent, reviewing]) expect(await t.photos.get(key)).not.toBeNull()
    const rows = await t.db.prepare('SELECT reference_code, proof_key, proof_sha256 FROM donations ORDER BY id').all<any>()
    expect(rows.results.map((r) => [r.reference_code, r.proof_key !== null, r.proof_sha256])).toEqual([
      ['HF-1', false, 'sha-1'],
      ['HF-2', false, 'sha-2'],
      ['HF-3', true, 'sha-3'],
      ['HF-4', true, 'sha-4'],
      ['HF-5', false, 'sha-5'],
    ])
  })

  it('follows the retention period set in the legal information', async () => {
    const { user, campaign } = await setup()
    await t.db.prepare(`INSERT INTO legal_versions (version, info_json, material, published_by) VALUES (1, ?, 0, ?)`)
      .bind(JSON.stringify({ legal_name_ar: '', legal_name_en: '', registration_no: '', address: '', courts: 'طرابلس', retention_financial_years: null, retention_screenshots_days: 30, wrong_transfer_days: 14, privacy_reply_days: 30 }), user)
      .run()
    const key = await donation(user, campaign, 1, 'confirmed', 31)
    expect((await dailyCleanup(t.env, NOW)).screenshots).toBe(1)
    expect(await t.photos.get(key)).toBeNull()
  })

  it('clears technical records after 90 days and deletes long-expired sessions', async () => {
    const { user } = await setup()
    await t.db.batch([
      t.db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_hash, created_at, expires_at) VALUES (?, 'old', 'Firefox', 'ip1', ?, ?)`).bind(user, ago(100), ago(70)),
      t.db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_hash, created_at, expires_at) VALUES (?, 'ancient', 'Chrome', 'ip2', ?, ?)`).bind(user, ago(200), ago(170)),
      t.db.prepare(`INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_hash, created_at, expires_at) VALUES (?, 'new', 'Safari', 'ip3', ?, ?)`).bind(user, ago(5), ago(-25)),
      t.db.prepare(`INSERT INTO audit_logs (action, entity, ip_hash, created_at) VALUES ('x.old', 'test', 'ipA', ?)`).bind(ago(100)),
      t.db.prepare(`INSERT INTO audit_logs (action, entity, ip_hash, created_at) VALUES ('x.new', 'test', 'ipB', ?)`).bind(ago(3)),
    ])
    const result = await dailyCleanup(t.env, NOW)
    expect(result).toMatchObject({ sessions_cleared: 2, sessions_deleted: 1, audit_ips_cleared: 1 })
    const sessions = await t.db.prepare(`SELECT token_hash, user_agent, ip_hash FROM refresh_tokens WHERE token_hash IN ('old', 'ancient', 'new') ORDER BY token_hash`).all<any>()
    expect(sessions.results).toEqual([
      { token_hash: 'new', user_agent: 'Safari', ip_hash: 'ip3' },
      { token_hash: 'old', user_agent: null, ip_hash: null },
    ])
    const audit = await t.db.prepare(`SELECT action, ip_hash FROM audit_logs WHERE entity = 'test' ORDER BY id`).all<any>()
    expect(audit.results).toEqual([{ action: 'x.old', ip_hash: null }, { action: 'x.new', ip_hash: 'ipB' }])
    // The run itself is recorded.
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'maintenance.cleanup'`).first<{ n: number }>())!.n).toBe(1)
  })

  it('records nothing when there was nothing to clean', async () => {
    await dailyCleanup(t.env, NOW)
    expect((await t.db.prepare(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'maintenance.cleanup'`).first<{ n: number }>())!.n).toBe(0)
  })
})

describe('the audit log stays unchangeable', () => {
  it('only an IP hash may be cleared; nothing else may change and nothing may be deleted', async () => {
    await t.db.prepare(`INSERT INTO audit_logs (action, entity, ip_hash) VALUES ('report.verify', 'potholes', 'ip')`).run()
    await expect(Promise.resolve().then(() => t.db.prepare(`UPDATE audit_logs SET action = 'report.reject'`).run())).rejects.toThrow(/immutable/)
    await expect(Promise.resolve().then(() => t.db.prepare(`UPDATE audit_logs SET ip_hash = 'other'`).run())).rejects.toThrow(/immutable/)
    await expect(Promise.resolve().then(() => t.db.prepare(`UPDATE audit_logs SET ip_hash = NULL, action = 'x'`).run())).rejects.toThrow(/immutable/)
    await expect(Promise.resolve().then(() => t.db.prepare(`DELETE FROM audit_logs`).run())).rejects.toThrow(/immutable/)
    await t.db.prepare(`UPDATE audit_logs SET ip_hash = NULL`).run()
    expect(await t.db.prepare(`SELECT ip_hash, action FROM audit_logs`).first()).toEqual({ ip_hash: null, action: 'report.verify' })
  })
})
