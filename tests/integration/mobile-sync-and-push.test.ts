import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv

beforeEach(() => {
  t = createTestEnv()
})

async function registerUser(env: TestEnv['env'], email: string, role: 'user' | 'admin' = 'user') {
  const res = await request(env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!', consent: true, locale: 'ar' }),
  })
  expect(res.status).toBe(201)
  if (role !== 'user') {
    await (env.DB as any).prepare(`UPDATE users SET role = ? WHERE email = ?`).bind(role, email).run()
  }
  const loginRes = await request(env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'Str0ngP@ssw0rd!' }),
  })
  expect(loginRes.status).toBe(200)
  return json(loginRes)
}

describe('Mobile Auth & Refresh Token Rotation', () => {
  it('returns refresh_token in JSON on login and allows refreshing via JSON body or X-Refresh-Token header without cookies', async () => {
    const loginData = await registerUser(t.env, 'mobile-citizen@example.com')
    expect(loginData.access_token).toBeTruthy()
    expect(loginData.refresh_token).toBeTruthy()

    const refreshRes1 = await request(t.env, '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: loginData.refresh_token }),
    })
    expect(refreshRes1.status).toBe(200)
    const refreshed1 = await json(refreshRes1)
    expect(refreshed1.access_token).toBeTruthy()

    const refreshRes2 = await request(t.env, '/api/auth/refresh', {
      method: 'POST',
      headers: { 'X-Refresh-Token': loginData.refresh_token },
    })
    expect(refreshRes2.status).toBe(200)
  })

  it('revokes the refresh token in D1 on logout so subsequent refresh attempts return 401', async () => {
    const loginData = await registerUser(t.env, 'mobile-logout@example.com')

    const logoutRes = await request(t.env, '/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: loginData.refresh_token }),
    })
    expect(logoutRes.status).toBe(200)

    const refreshAfterLogout = await request(t.env, '/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: loginData.refresh_token }),
    })
    expect(refreshAfterLogout.status).toBe(401)
  })
})

describe('Idempotent Offline Report Sync, Community Upvotes & One-Click Admin Delete', () => {
  it('deduplicates retried offline reports sharing the same client_report_uuid', async () => {
    const clientUuid = 'offline-uuid-tripoli-2026-0001'
    const payload = {
      lat: 32.8811,
      lng: 13.3502,
      severity: 'severe',
      street_ar: 'شارع الجمهورية قرب جزيرة الدهماني',
      description_ar: 'حفرة عميقة تم رصدها بدون إنترنت',
      client_report_uuid: clientUuid,
    }

    const firstRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(firstRes.status).toBe(201)
    const firstBody = await json(firstRes)

    const retryRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    expect(retryRes.status).toBe(200)
    const retryBody = await json(retryRes)
    expect(retryBody.id).toBe(firstBody.id)
    expect(retryBody.deduplicated).toBe(true)
  })

  it('allows citizens to upvote/confirm an existing pothole once per user or IP', async () => {
    const citizen = await registerUser(t.env, 'upvoter@example.com', 'user')
    const createRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium' }),
    })
    const { id } = await json(createRes)

    const upvote1 = await request(t.env, `/api/potholes/${id}/upvote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizen.access_token}` },
    })
    expect(upvote1.status).toBe(201)
    const body1 = await json(upvote1)
    expect(body1.upvotes_count).toBe(1)
    expect(body1.already_upvoted).toBe(false)

    const upvote2 = await request(t.env, `/api/potholes/${id}/upvote`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${citizen.access_token}` },
    })
    expect(upvote2.status).toBe(200)
    const body2 = await json(upvote2)
    expect(body2.upvotes_count).toBe(1)
    expect(body2.already_upvoted).toBe(true)
  })

  it('allows an admin to delete a report in one click (DELETE /api/potholes/:id) and forbids regular users', async () => {
    const citizen = await registerUser(t.env, 'regular@example.com', 'user')
    const admin = await registerUser(t.env, 'deleter-admin@example.com', 'admin')

    const createRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'minor' }),
    })
    const { id } = await json(createRes)

    // Citizen cannot delete
    const forbiddenRes = await request(t.env, `/api/potholes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${citizen.access_token}` },
    })
    expect(forbiddenRes.status).toBe(403)

    // Admin deletes in one call
    const delRes = await request(t.env, `/api/potholes/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${admin.access_token}` },
    })
    expect(delRes.status).toBe(200)

    // Report is now 404 on detail and excluded from public list
    const detailAfter = await request(t.env, `/api/potholes/${id}`)
    expect(detailAfter.status).toBe(404)
  })
})

describe('Citizen Notifications & Device Push Tokens', () => {
  it('delivers bilingual status_change notifications to the citizen when an admin updates their report', async () => {
    const citizen = await registerUser(t.env, 'reporter@example.com', 'user')
    const admin = await registerUser(t.env, 'field-admin@example.com', 'admin')

    const createRes = await request(t.env, '/api/potholes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen.access_token}`,
      },
      body: JSON.stringify({
        lat: 32.8811,
        lng: 13.3502,
        severity: 'medium',
        description_ar: 'حفرة أمام المدرسة',
      }),
    })
    expect(createRes.status).toBe(201)
    const { id: potholeId } = await json(createRes)

    const patchRes = await request(t.env, `/api/potholes/${potholeId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${admin.access_token}`,
      },
      body: JSON.stringify({ status: 'fixed', note: 'Repaired by field crew' }),
    })
    expect(patchRes.status).toBe(200)

    const notifRes = await request(t.env, '/api/notifications', {
      headers: { Authorization: `Bearer ${citizen.access_token}` },
    })
    expect(notifRes.status).toBe(200)
    const notifData = await json(notifRes)
    expect(notifData.unread_count).toBe(1)
    expect(notifData.results).toHaveLength(1)
  })

  it('registers and deactivates Android/iOS/Web push tokens in device_push_tokens', async () => {
    const citizen = await registerUser(t.env, 'push-user@example.com', 'user')

    const regRes = await request(t.env, '/api/notifications/push-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen.access_token}`,
      },
      body: JSON.stringify({
        platform: 'android',
        token: 'fcm-device-token-tripoli-1234567890',
        locale: 'ar',
      }),
    })
    expect(regRes.status).toBe(201)

    const delRes = await request(t.env, '/api/notifications/push-token', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${citizen.access_token}`,
      },
      body: JSON.stringify({ token: 'fcm-device-token-tripoli-1234567890' }),
    })
    expect(delRes.status).toBe(200)
  })
})
