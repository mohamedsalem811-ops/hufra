// Password hashing using Web Crypto PBKDF2 (available in Cloudflare Workers).
// Format stored in DB: pbkdf2$<iterations>$<saltBase64>$<hashBase64>
//
// IMPORTANT CLOUDFLARE WORKERS FIX:
// Cloudflare Workers' WebCrypto runtime (workerd) enforces a maximum of
// 100,000 iterations for PBKDF2 (values >100,000 throw NotSupportedError
// in production Workers even though Node.js allows higher values locally).

const ITERATIONS = 100_000
const HASH_BITS = 256
const SALT_BYTES = 16

function toBase64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array, iterations: number): Promise<ArrayBuffer> {
  const enc = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  return crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    HASH_BITS
  )
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const derived = await deriveKey(password, salt, ITERATIONS)
  return `pbkdf2$${ITERATIONS}$${toBase64(salt.buffer)}$${toBase64(derived)}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const parts = stored.split('$')
    if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
    const iterations = parseInt(parts[1], 10)
    if (!Number.isFinite(iterations) || iterations <= 0) return false
    const salt = fromBase64(parts[2])
    const expected = parts[3]
    const derived = await deriveKey(password, salt, iterations)
    const actual = toBase64(derived)
    return timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/** Minimal password strength check (assumption: 8+ chars, not a full policy engine). */
export function isPasswordStrongEnough(password: string): boolean {
  return typeof password === 'string' && password.length >= 8
}

/**
 * Passwords that have been published and must never authenticate anyone.
 * `Hufra@Admin2026!` was the default super-admin password, printed in this
 * repository's README, deploy.sh and migration 0006 - so every deployment
 * that still uses it is open to anyone who has read the code.
 * Keep in sync with scripts/set-admin-password.mjs.
 */
const KNOWN_PUBLIC_PASSWORDS = new Set(['Hufra@Admin2026!'])

export function isKnownPublicPassword(password: string): boolean {
  return KNOWN_PUBLIC_PASSWORDS.has(password)
}
