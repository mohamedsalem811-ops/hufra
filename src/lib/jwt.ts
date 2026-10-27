// Minimal HMAC-SHA256 JWT implementation using Web Crypto (no external deps,
// runs natively in Cloudflare Workers). Supports the small subset of JWT
// needed here: HS256, exp claim, and simple payload verification.

export interface JwtPayload {
  sub: number // user id
  role: 'user' | 'admin' | 'super_admin'
  code: string
  exp: number // unix seconds
  iat: number
  typ: 'access' | 'refresh'
}

function base64url(input: ArrayBuffer | string): string {
  let bytes: Uint8Array
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input)
  } else {
    bytes = new Uint8Array(input)
  }
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(input: string): Uint8Array {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

export async function signJwt(payload: JwtPayload, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' }
  const encodedHeader = base64url(JSON.stringify(header))
  const encodedPayload = base64url(JSON.stringify(payload))
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signingInput))
  return `${signingInput}.${base64url(signature)}`
}

export async function verifyJwt(token: string, secret: string): Promise<JwtPayload | null> {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [encodedHeader, encodedPayload, encodedSignature] = parts
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const key = await hmacKey(secret)
  const signatureBytes = base64urlDecode(encodedSignature)
  const valid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(signingInput)
  )
  if (!valid) return null

  try {
    const payloadJson = new TextDecoder().decode(base64urlDecode(encodedPayload))
    const payload = JSON.parse(payloadJson) as JwtPayload
    if (typeof payload.exp !== 'number' || payload.exp < Math.floor(Date.now() / 1000)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60 // 15 minutes
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

export function nowSeconds(): number {
  return Math.floor(Date.now() / 1000)
}
