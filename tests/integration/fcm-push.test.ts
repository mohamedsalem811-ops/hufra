// Push notifications via FCM HTTP v1 (the legacy API used before was shut
// down by Google). Google's servers are replaced by a fetch mock that checks
// exactly what the Worker sends.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'
import { buildAssertion, clearAccessTokenCache, isFcmToken, parseServiceAccount } from '../../src/lib/fcm'

const PW = 'Str0ngP@ssw0rd!'
let serviceAccountJson: string
let publicKey: CryptoKey
let t: TestEnv

beforeAll(async () => {
  const pair = (await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  )) as CryptoKeyPair
  publicKey = pair.publicKey
  const der = new Uint8Array((await crypto.subtle.exportKey('pkcs8', pair.privateKey)) as ArrayBuffer)
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n')
  serviceAccountJson = JSON.stringify({
    type: 'service_account',
    project_id: 'hufra-test',
    client_email: 'push@hufra-test.iam.gserviceaccount.com',
    private_key: `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`,
  })
})

beforeEach(() => {
  t = createTestEnv()
  clearAccessTokenCache()
})
afterEach(() => vi.restoreAllMocks())

/** Fake Google: token endpoint + FCM send endpoint. `dead` tokens answer 404 UNREGISTERED. */
function mockGoogle(opts: { dead?: string[]; fcmDown?: boolean } = {}) {
  const sent: Array<{ token: string; title: string; body: string; url: string; auth: string }> = []
  let tokenExchanges = 0
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url === 'https://oauth2.googleapis.com/token') {
      tokenExchanges++
      return new Response(JSON.stringify({ access_token: 'ya29.test-access-token', expires_in: 3599 }), { status: 200 })
    }
    if (url === 'https://fcm.googleapis.com/v1/projects/hufra-test/messages:send') {
      if (opts.fcmDown) throw new Error('network down')
      const msg = JSON.parse(init.body).message
      if (opts.dead?.includes(msg.token)) {
        return new Response(
          JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
          { status: 404 }
        )
      }
      sent.push({ token: msg.token, title: msg.notification.title, body: msg.notification.body, url: msg.data.url, auth: init.headers.Authorization })
      return new Response(JSON.stringify({ name: 'projects/hufra-test/messages/1' }), { status: 200 })
    }
    throw new Error(`unexpected fetch ${url}`)
  })
  return { sent, spy, exchanges: () => tokenExchanges }
}

async function userWithToken(email: string, role: 'user' | 'admin' | 'super_admin', pushToken: string, platform = 'android', locale = 'ar') {
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, consent: true }),
  })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const login = await json(
    await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: PW }),
    })
  )
  const res = await request(t.env, '/api/notifications/push-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${login.access_token}` },
    body: JSON.stringify({ platform, token: pushToken, locale }),
  })
  expect(res.status).toBe(201)
  return login.access_token as string
}

const ANDROID_A = 'fcm-token-admin-aaaaaaaaaaaa:APA91bAAAA'
const ANDROID_B = 'fcm-token-admin-bbbbbbbbbbbb:APA91bBBBB'
const IOS_APNS = 'a'.repeat(64)

function createReport(env = t.env, token?: string) {
  return request(env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'severe' }),
  })
}

describe('FCM HTTP v1 push', () => {
  it('a new report notifies every admin device, in each admin’s language, with one auth exchange', async () => {
    await userWithToken('a1@example.com', 'admin', ANDROID_A, 'android', 'ar')
    await userWithToken('a2@example.com', 'super_admin', ANDROID_B, 'android', 'en')
    await userWithToken('citizen@example.com', 'user', 'fcm-citizen-token-cccccccccc:APA91bC')
    const google = mockGoogle()
    const env = { ...t.env, FCM_SERVICE_ACCOUNT: serviceAccountJson }

    expect((await createReport(env)).status).toBe(201)
    expect(google.sent.map((m) => m.token).sort()).toEqual([ANDROID_A, ANDROID_B].sort()) // not the citizen
    expect(google.sent.every((m) => m.auth === 'Bearer ya29.test-access-token')).toBe(true)
    expect(google.sent.find((m) => m.token === ANDROID_A)!.title).toMatch(/بلاغ/)
    expect(google.sent.find((m) => m.token === ANDROID_B)!.title).toMatch(/New pothole report/)
    expect(google.sent[0].url).toMatch(/^\/admin\?report=\d+$/)

    // A second notification reuses the cached access token.
    await createReport(env)
    expect(google.exchanges()).toBe(1)
  })

  it('the reporter is notified when an admin changes the status', async () => {
    const reporter = await userWithToken('rep@example.com', 'user', 'fcm-reporter-token-rrrrrrrr:APA91bR', 'android', 'en')
    const admin = await userWithToken('adm@example.com', 'admin', ANDROID_A)
    const env = { ...t.env, FCM_SERVICE_ACCOUNT: serviceAccountJson }
    const google = mockGoogle()
    const { id } = await json(await createReport(env, reporter))
    google.sent.length = 0
    await request(env, `/api/potholes/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ status: 'verified' }),
    })
    expect(google.sent).toHaveLength(1)
    expect(google.sent[0]).toMatchObject({ token: 'fcm-reporter-token-rrrrrrrr:APA91bR', body: 'Your report status is now: Verified', url: `/pothole/${id}` })
  })

  it('switches off tokens Google reports as unregistered (app uninstalled)', async () => {
    await userWithToken('a1@example.com', 'admin', ANDROID_A)
    await userWithToken('a2@example.com', 'admin', ANDROID_B)
    const google = mockGoogle({ dead: [ANDROID_B] })
    await createReport({ ...t.env, FCM_SERVICE_ACCOUNT: serviceAccountJson })
    expect(google.sent.map((m) => m.token)).toEqual([ANDROID_A])
    const rows = await t.db.prepare('SELECT token, active FROM device_push_tokens ORDER BY token').all<{ token: string; active: number }>()
    expect(rows.results).toEqual([
      { token: ANDROID_A, active: 1 },
      { token: ANDROID_B, active: 0 },
    ])
  })

  it('skips raw iOS APNs tokens (FCM cannot deliver them) instead of disabling them', async () => {
    await userWithToken('a1@example.com', 'admin', IOS_APNS, 'ios')
    const google = mockGoogle()
    await createReport({ ...t.env, FCM_SERVICE_ACCOUNT: serviceAccountJson })
    expect(google.sent).toHaveLength(0)
    const row = await t.db.prepare('SELECT active FROM device_push_tokens').first<{ active: number }>()
    expect(row?.active).toBe(1)
  })

  it('never breaks report creation when Google is unreachable', async () => {
    await userWithToken('a1@example.com', 'admin', ANDROID_A)
    mockGoogle({ fcmDown: true })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const res = await createReport({ ...t.env, FCM_SERVICE_ACCOUNT: serviceAccountJson })
    expect(res.status).toBe(201)
    const row = await t.db.prepare('SELECT active FROM device_push_tokens').first<{ active: number }>()
    expect(row?.active).toBe(1) // a network error is not a dead token
  })

  it('sends nothing (and calls no one) when push is not configured', async () => {
    await userWithToken('a1@example.com', 'admin', ANDROID_A)
    const google = mockGoogle()
    expect((await createReport()).status).toBe(201)
    expect(google.spy).not.toHaveBeenCalled()
  })
})

describe('fcm helpers', () => {
  it('signs a valid RS256 assertion for Google’s token endpoint', async () => {
    const sa = parseServiceAccount(serviceAccountJson)!
    const jwt = await buildAssertion(sa, 1_700_000_000)
    const [h, c, s] = jwt.split('.')
    const dec = (x: string) => JSON.parse(Buffer.from(x, 'base64url').toString())
    expect(dec(h)).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(dec(c)).toEqual({
      iss: 'push@hufra-test.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    })
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', publicKey, Buffer.from(s, 'base64url'), new TextEncoder().encode(`${h}.${c}`))
    expect(ok).toBe(true)
  })

  it('accepts a key pasted with escaped newlines, rejects incomplete JSON', async () => {
    const escaped = JSON.parse(serviceAccountJson)
    escaped.private_key = escaped.private_key.replace(/\n/g, '\\n')
    await expect(buildAssertion(parseServiceAccount(JSON.stringify(escaped))!)).resolves.toMatch(/^ey/)
    expect(parseServiceAccount('{"project_id":"x"}')).toBeNull()
    expect(parseServiceAccount('not json')).toBeNull()
    expect(parseServiceAccount(undefined)).toBeNull()
  })

  it('recognises which tokens FCM can deliver', () => {
    expect(isFcmToken('android', ANDROID_A)).toBe(true)
    expect(isFcmToken('ios', IOS_APNS)).toBe(false)
    expect(isFcmToken('web', 'https://fcm.googleapis.com/fcm/send/abc')).toBe(false)
  })
})
