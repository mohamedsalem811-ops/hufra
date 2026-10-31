// Firebase Cloud Messaging, HTTP v1 API.
//
// The legacy API (https://fcm.googleapis.com/fcm/send with a "server key")
// that HUFRA used before was shut down by Google in 2024. HTTP v1 needs an
// OAuth2 access token obtained with a service-account key:
//
//   1. Sign a JWT (RS256) with the service account's private key.
//   2. Exchange it at https://oauth2.googleapis.com/token for an access token
//      (valid 1 hour; cached in memory and in KV).
//   3. POST each message to
//      https://fcm.googleapis.com/v1/projects/<project_id>/messages:send
//
// Everything uses Web Crypto, so no Node/Google SDK is needed in the Worker.
// Configure with the secret FCM_SERVICE_ACCOUNT = the full JSON key file
// downloaded from Firebase console -> Project settings -> Service accounts.

import type { Bindings } from './types'

export interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

export interface PushMessage {
  title: string
  body: string
  url: string
}

export type SendResult = { ok: true } | { ok: false; status: number; tokenInvalid: boolean; error: string }

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const KV_TOKEN_KEY = 'fcm:access_token:v1'

export function parseServiceAccount(raw: string | undefined): ServiceAccount | null {
  if (!raw) return null
  try {
    const sa = JSON.parse(raw)
    if (typeof sa.project_id === 'string' && typeof sa.client_email === 'string' && typeof sa.private_key === 'string') {
      return { project_id: sa.project_id, client_email: sa.client_email, private_key: sa.private_key }
    }
  } catch {
    /* fall through */
  }
  return null
}

function b64url(input: ArrayBuffer | string): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : new Uint8Array(input)
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const body = pem
    .replace(/\\n/g, '\n') // keys pasted with escaped newlines
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s+/g, '')
  const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0))
  return crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
}

/** The signed assertion exchanged for an access token (RFC 7523). Exported for tests. */
export async function buildAssertion(sa: ServiceAccount, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL, iat: nowSeconds, exp: nowSeconds + 3600 })
  )
  const key = await importPrivateKey(sa.private_key)
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`))
  return `${header}.${claims}.${b64url(sig)}`
}

// Per-isolate cache, so a burst of notifications needs one token exchange.
let memoryToken: { token: string; exp: number; email: string } | null = null

export function clearAccessTokenCache() {
  memoryToken = null
}

export async function getAccessToken(sa: ServiceAccount, kv?: Bindings['KV']): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  if (memoryToken && memoryToken.email === sa.client_email && memoryToken.exp - 60 > now) return memoryToken.token

  if (kv) {
    const cached = await kv.get(KV_TOKEN_KEY).catch(() => null)
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as { token: string; exp: number; email: string }
        if (parsed.email === sa.client_email && parsed.exp - 60 > now) {
          memoryToken = parsed
          return parsed.token
        }
      } catch {
        /* ignore a corrupt cache entry */
      }
    }
  }

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: await buildAssertion(sa, now),
    }),
  })
  if (!res.ok) throw new Error(`FCM auth failed: HTTP ${res.status} ${await res.text().catch(() => '')}`.slice(0, 300))
  const data = (await res.json()) as { access_token: string; expires_in: number }
  memoryToken = { token: data.access_token, exp: now + (data.expires_in || 3600), email: sa.client_email }
  if (kv) {
    await kv
      .put(KV_TOKEN_KEY, JSON.stringify(memoryToken), { expirationTtl: Math.max(60, (data.expires_in || 3600) - 120) })
      .catch(() => undefined)
  }
  return data.access_token
}

/** Error codes meaning "this device token will never work again": stop sending to it. */
const DEAD_TOKEN_CODES = new Set(['UNREGISTERED', 'INVALID_ARGUMENT', 'SENDER_ID_MISMATCH'])

export async function sendFcmMessage(
  accessToken: string,
  projectId: string,
  deviceToken: string,
  msg: PushMessage
): Promise<SendResult> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      message: {
        token: deviceToken,
        notification: { title: msg.title, body: msg.body },
        data: { url: msg.url },
        android: { priority: 'high', notification: { sound: 'default' } },
        apns: { payload: { aps: { sound: 'default' } } },
      },
    }),
  })
  if (res.ok) return { ok: true }

  let code = ''
  let message = ''
  try {
    const err = (await res.json()) as { error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> } }
    code = err.error?.details?.find((d) => d.errorCode)?.errorCode || err.error?.status || ''
    message = err.error?.message || ''
  } catch {
    /* non-JSON error body */
  }
  // 404 is always UNREGISTERED. INVALID_ARGUMENT at 400 is a malformed/foreign token
  // (our message payload is fixed, so it cannot be the cause).
  const tokenInvalid = res.status === 404 || (res.status === 400 && DEAD_TOKEN_CODES.has(code)) || code === 'SENDER_ID_MISMATCH'
  return { ok: false, status: res.status, tokenInvalid, error: `${code} ${message}`.trim() }
}

/**
 * True for tokens FCM can deliver to. Android registration tokens are FCM
 * tokens. On iOS, Capacitor's PushNotifications plugin returns a raw APNs
 * device token (64 hex characters) unless the Firebase iOS SDK is added, and
 * FCM cannot send to that, so those are skipped instead of being reported as
 * failures.
 */
export function isFcmToken(platform: string, token: string): boolean {
  if (platform === 'web') return false
  if (/^[0-9a-f]{64}$/i.test(token)) return false
  return token.length >= 20
}
