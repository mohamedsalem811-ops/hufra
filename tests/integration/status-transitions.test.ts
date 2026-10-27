// Integration test: PATCH /api/potholes/:id/status lifecycle transitions.
//
// This is the primary regression test for Bug #2 (found via integration
// testing during this task): the status_history table is immutable by
// trigger design (trg_status_history_no_update aborts any UPDATE), but the
// original code tried to UPDATE a status_history row *after* the
// trg_potholes_status_history auto-insert trigger had already created it, to
// attach actor_id/note - which always violated the immutability trigger and
// caused every admin status-change request to fail with a 500
// (SQLITE_CONSTRAINT_TRIGGER). The fix (migrations/0004) stages actor/note
// in `pending_status_change` immediately before the UPDATE potholes
// statement runs, and the rewritten trigger reads+clears that staging row
// inside the same INSERT - so status_history is correctly attributed from
// creation and never needs a follow-up UPDATE.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function makeFullyEnrolledAdmin(env: TestEnv['env'], email = 'admin@example.com') {
  await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  await (env.DB as any).prepare(`UPDATE users SET role = 'admin' WHERE email = ?`).bind(email).run()

  const loginRes = await request(env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
  })
  const { access_token } = await json(loginRes)
  return access_token as string
}

async function createReport(env: TestEnv['env']) {
  const res = await request(env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'severe' }),
  })
  return (await json(res)).id as number
}

describe('PATCH /api/potholes/:id/status', () => {
  it('rejects unauthenticated requests', async () => {
    const potholeId = await createReport(t.env)
    const res = await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'verified' }),
    })
    expect(res.status).toBe(401)
  })

  it('rejects a regular (non-admin) authenticated user', async () => {
    await request(t.env, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'Str0ngP@ssw0rd!', consent: true }),
    })
    const loginRes = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'user@example.com', password: 'Str0ngP@ssw0rd!' }),
    })
    const { access_token } = await json(loginRes)

    const potholeId = await createReport(t.env)
    const res = await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${access_token}` },
      body: JSON.stringify({ status: 'verified' }),
    })
    expect(res.status).toBe(403)
  })

  it('an enrolled admin transitions reported -> verified -> under_repair -> fixed, WITHOUT a 500 (regression for Bug #2)', async () => {
    const token = await makeFullyEnrolledAdmin(t.env)
    const potholeId = await createReport(t.env)

    for (const status of ['verified', 'under_repair', 'fixed']) {
      const res = await request(t.env, `/api/potholes/${potholeId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status, note: `moved to ${status}` }),
      })
      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body).toEqual({ ok: true, status })
    }

    const pothole = await t.db.prepare('SELECT * FROM potholes WHERE id = ?').bind(potholeId).first<any>()
    expect(pothole.status).toBe('fixed')
    expect(pothole.verified_at).not.toBeNull()
    expect(pothole.under_repair_at).not.toBeNull()
    expect(pothole.fixed_at).not.toBeNull()
  })

  it('correctly attributes actor_id and note on every status_history row (the actual bug being fixed)', async () => {
    const token = await makeFullyEnrolledAdmin(t.env)
    const potholeId = await createReport(t.env)

    await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'verified', note: 'confirmed on-site' }),
    })

    const admin = await t.db.prepare('SELECT id FROM users WHERE email = ?').bind('admin@example.com').first<{ id: number }>()
    const history = await t.db
      .prepare('SELECT * FROM status_history WHERE pothole_id = ? ORDER BY id DESC LIMIT 1')
      .bind(potholeId)
      .first<any>()

    expect(history.to_status).toBe('verified')
    expect(history.actor_id).toBe(admin!.id)
    expect(history.note).toBe('confirmed on-site')
  })

  it('leaves no leftover row in the pending_status_change staging table after the update', async () => {
    const token = await makeFullyEnrolledAdmin(t.env)
    const potholeId = await createReport(t.env)

    await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'verified' }),
    })

    const pending = await t.db.prepare('SELECT * FROM pending_status_change WHERE pothole_id = ?').bind(potholeId).first()
    expect(pending).toBeNull()
  })

  it('status_history remains immutable even indirectly (no route ever issues UPDATE/DELETE on it)', async () => {
    const token = await makeFullyEnrolledAdmin(t.env)
    const potholeId = await createReport(t.env)
    await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'verified' }),
    })

    // Direct UPDATE attempt against the real trigger-protected schema must abort.
    await expect(
      t.db.prepare(`UPDATE status_history SET note = 'tampered' WHERE pothole_id = ?`).bind(potholeId).run()
    ).rejects.toThrow(/immutable/)
  })

  it('notifies the reporter on status change when the report has a registered reporter_id', async () => {
    const token = await makeFullyEnrolledAdmin(t.env)

    // Register + log in a regular user, then submit the report while authenticated
    // so reporter_id is set (guest reports have reporter_id = NULL and get no notifyUser call).
    await request(t.env, '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reporter@example.com', password: 'Str0ngP@ssw0rd!', consent: true }),
    })
    const reporterLogin = await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'reporter@example.com', password: 'Str0ngP@ssw0rd!' }),
    })
    const { access_token: reporterToken } = await json(reporterLogin)

    const createRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${reporterToken}` },
      body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'minor' }),
    })
    const { id: potholeId } = await json(createRes)

    await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'verified' }),
    })

    const reporter = await t.db.prepare('SELECT id FROM users WHERE email = ?').bind('reporter@example.com').first<{ id: number }>()
    const notifications = await t.db
      .prepare(`SELECT * FROM notifications WHERE target_user_id = ? AND type = 'status_change'`)
      .bind(reporter!.id)
      .all()
    expect(notifications.results.length).toBe(1)
  })
})
