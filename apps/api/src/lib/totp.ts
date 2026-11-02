// TOTP (RFC 6238) implementation using Web Crypto HMAC-SHA1, dependency-free.
// Used for mandatory admin 2FA. Compatible with standard authenticator apps
// (Google Authenticator, Authy, etc.) via the otpauth:// URI + Base32 secret.

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function generateBase32Secret(byteLength = 20): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return base32Encode(bytes)
}

function base32Encode(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let output = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31]
  }
  return output
}

function base32Decode(input: string): Uint8Array<ArrayBuffer> {
  const clean = input.toUpperCase().replace(/=+$/, '')
  let bits = 0
  let value = 0
  const output: number[] = []
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char)
    if (idx === -1) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return new Uint8Array(output)
}

async function hmacSha1(keyBytes: Uint8Array<ArrayBuffer>, message: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )
  return crypto.subtle.sign('HMAC', key, message)
}

function intToBytes(num: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(8)
  let big = BigInt(num)
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(big & 0xffn)
    big >>= 8n
  }
  return bytes
}

export async function generateTotp(
  base32Secret: string,
  timeStepSeconds = 30,
  digits = 6,
  timestamp = Date.now()
): Promise<string> {
  const counter = Math.floor(timestamp / 1000 / timeStepSeconds)
  const key = base32Decode(base32Secret)
  const message = intToBytes(counter)
  const hmac = new Uint8Array(await hmacSha1(key, message))

  const offset = hmac[hmac.length - 1] & 0x0f
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)

  const otp = binary % 10 ** digits
  return otp.toString().padStart(digits, '0')
}

/** Verify a submitted TOTP code, allowing +/-1 time step of clock drift. */
export async function verifyTotp(
  base32Secret: string,
  code: string,
  timeStepSeconds = 30,
  window = 1
): Promise<boolean> {
  const now = Date.now()
  for (let i = -window; i <= window; i++) {
    const candidate = await generateTotp(
      base32Secret,
      timeStepSeconds,
      6,
      now + i * timeStepSeconds * 1000
    )
    if (candidate === code) return true
  }
  return false
}

export function buildTotpUri(secret: string, accountLabel: string, issuer = 'HUFRA'): string {
  const label = encodeURIComponent(`${issuer}:${accountLabel}`)
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: '30' })
  return `otpauth://totp/${label}?${params.toString()}`
}
