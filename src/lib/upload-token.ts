// Short-lived "upload permit" for a single report.
//
// Guests can file reports without an account, so "is this your report?" can
// not be answered from a login. Instead, POST /api/potholes hands back a
// permit that only the client that created the report receives. Photo
// uploads for stage "report" must present it (or come from the logged-in
// reporter, or an admin). Without it, anyone could attach photos to anyone's
// report.
//
// Format: <potholeId>.<expiresUnixSeconds>.<base64url HMAC-SHA256>
// The HMAC input is prefixed with "hufra-upload:" so a permit can never be
// confused with, or used as, a login token (those are JWTs signed over
// different input).

export const UPLOAD_TOKEN_TTL_SECONDS = 6 * 60 * 60 // 6 hours: plenty for slow networks and offline sync

const enc = new TextEncoder()

function b64url(bytes: ArrayBuffer): string {
  let s = ''
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b)
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/')
  const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4))
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function createUploadToken(potholeId: number, secret: string, now = Date.now()): Promise<string> {
  const exp = Math.floor(now / 1000) + UPLOAD_TOKEN_TTL_SECONDS
  const body = `${potholeId}.${exp}`
  const sig = await crypto.subtle.sign('HMAC', await key(secret), enc.encode(`hufra-upload:${body}`))
  return `${body}.${b64url(sig)}`
}

/** True only for an unexpired permit that this server issued for exactly this report. */
export async function verifyUploadToken(token: unknown, potholeId: number, secret: string, now = Date.now()): Promise<boolean> {
  if (typeof token !== 'string' || token.length > 200) return false
  const m = /^(\d{1,10})\.(\d{1,12})\.([A-Za-z0-9_-]{20,})$/.exec(token)
  if (!m) return false
  if (Number(m[1]) !== potholeId) return false
  if (Number(m[2]) < Math.floor(now / 1000)) return false
  try {
    return await crypto.subtle.verify('HMAC', await key(secret), b64urlDecode(m[3]), enc.encode(`hufra-upload:${m[1]}.${m[2]}`))
  } catch {
    return false
  }
}
