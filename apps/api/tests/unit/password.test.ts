import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, isPasswordStrongEnough } from '../../src/lib/password'

describe('hashPassword / verifyPassword', () => {
  it('produces a pbkdf2$iterations$salt$hash formatted string', async () => {
    const hash = await hashPassword('CorrectHorseBattery1')
    const parts = hash.split('$')
    expect(parts).toHaveLength(4)
    expect(parts[0]).toBe('pbkdf2')
    expect(Number(parts[1])).toBeGreaterThan(0)
  })

  it('verifies a matching password', async () => {
    const hash = await hashPassword('MySecretPass123')
    await expect(verifyPassword('MySecretPass123', hash)).resolves.toBe(true)
  })

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('MySecretPass123')
    await expect(verifyPassword('WrongPassword', hash)).resolves.toBe(false)
  })

  it('produces different hashes for the same password (random salt)', async () => {
    const h1 = await hashPassword('SamePassword1')
    const h2 = await hashPassword('SamePassword1')
    expect(h1).not.toBe(h2)
    await expect(verifyPassword('SamePassword1', h1)).resolves.toBe(true)
    await expect(verifyPassword('SamePassword1', h2)).resolves.toBe(true)
  })

  it('rejects malformed stored hash strings', async () => {
    await expect(verifyPassword('anything', 'not-a-valid-hash')).resolves.toBe(false)
    await expect(verifyPassword('anything', 'bcrypt$10$salt$hash')).resolves.toBe(false)
    await expect(verifyPassword('anything', '')).resolves.toBe(false)
  })

  it('is case-sensitive', async () => {
    const hash = await hashPassword('CaseSensitive1')
    await expect(verifyPassword('casesensitive1', hash)).resolves.toBe(false)
  })
})

describe('isPasswordStrongEnough', () => {
  it('accepts passwords of 8+ characters', () => {
    expect(isPasswordStrongEnough('12345678')).toBe(true)
    expect(isPasswordStrongEnough('a-reasonably-long-passphrase')).toBe(true)
  })

  it('rejects short passwords', () => {
    expect(isPasswordStrongEnough('short')).toBe(false)
    expect(isPasswordStrongEnough('')).toBe(false)
  })

  it('rejects non-string input', () => {
    // @ts-expect-error deliberately testing runtime guard against bad input
    expect(isPasswordStrongEnough(12345678)).toBe(false)
    // @ts-expect-error deliberately testing runtime guard against bad input
    expect(isPasswordStrongEnough(null)).toBe(false)
  })
})
