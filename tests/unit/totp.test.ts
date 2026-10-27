import { describe, it, expect } from 'vitest'
import { generateBase32Secret, generateTotp, verifyTotp, buildTotpUri } from '../../src/lib/totp'

describe('generateBase32Secret', () => {
  it('produces an uppercase base32 string with no padding', () => {
    const secret = generateBase32Secret()
    expect(secret).toMatch(/^[A-Z2-7]+$/)
  })

  it('produces different secrets on each call', () => {
    const a = generateBase32Secret()
    const b = generateBase32Secret()
    expect(a).not.toBe(b)
  })
})

describe('generateTotp / verifyTotp', () => {
  it('generates a 6-digit numeric code', async () => {
    const secret = generateBase32Secret()
    const code = await generateTotp(secret)
    expect(code).toMatch(/^\d{6}$/)
  })

  it('verifies a freshly generated code against its own secret', async () => {
    const secret = generateBase32Secret()
    const code = await generateTotp(secret)
    await expect(verifyTotp(secret, code)).resolves.toBe(true)
  })

  it('rejects an incorrect code', async () => {
    const secret = generateBase32Secret()
    await expect(verifyTotp(secret, '000000')).resolves.toBe(false)
  })

  it('rejects a code generated from a different secret', async () => {
    const secretA = generateBase32Secret()
    const secretB = generateBase32Secret()
    const codeA = await generateTotp(secretA)
    await expect(verifyTotp(secretB, codeA)).resolves.toBe(false)
  })

  it('accepts a code from one time-step in the past (clock drift tolerance)', async () => {
    const secret = generateBase32Secret()
    const now = Date.now()
    const previousStepCode = await generateTotp(secret, 30, 6, now - 30_000)
    await expect(verifyTotp(secret, previousStepCode, 30, 1)).resolves.toBe(true)
  })

  it('accepts a code from one time-step in the future (clock drift tolerance)', async () => {
    const secret = generateBase32Secret()
    const now = Date.now()
    const nextStepCode = await generateTotp(secret, 30, 6, now + 30_000)
    await expect(verifyTotp(secret, nextStepCode, 30, 1)).resolves.toBe(true)
  })

  it('rejects a code from two time-steps away when window is 1', async () => {
    const secret = generateBase32Secret()
    const now = Date.now()
    const farCode = await generateTotp(secret, 30, 6, now + 90_000)
    await expect(verifyTotp(secret, farCode, 30, 1)).resolves.toBe(false)
  })

  it('is deterministic for the same secret + timestamp', async () => {
    const secret = generateBase32Secret()
    const ts = Date.now()
    const code1 = await generateTotp(secret, 30, 6, ts)
    const code2 = await generateTotp(secret, 30, 6, ts)
    expect(code1).toBe(code2)
  })
})

describe('buildTotpUri', () => {
  it('builds a valid otpauth:// URI with expected params', () => {
    const uri = buildTotpUri('ABCDEFGH23456789', 'admin@hufra.ly', 'HUFRA')
    expect(uri).toMatch(/^otpauth:\/\/totp\//)
    expect(uri).toContain('secret=ABCDEFGH23456789')
    expect(uri).toContain('issuer=HUFRA')
    expect(uri).toContain('algorithm=SHA1')
    expect(uri).toContain('digits=6')
    expect(uri).toContain('period=30')
  })

  it('url-encodes the account label', () => {
    const uri = buildTotpUri('SECRET', 'user with space@x.com', 'HUFRA')
    expect(uri).not.toContain(' ')
  })
})
