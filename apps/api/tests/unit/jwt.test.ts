import { describe, it, expect } from 'vitest'
import {
  signJwt,
  verifyJwt,
  nowSeconds,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../../src/lib/jwt'
import type { JwtPayload } from '../../src/lib/jwt'

const SECRET = 'test-secret-do-not-use-in-production'

function makePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  const now = nowSeconds()
  return {
    sub: 1,
    role: 'user',
    code: 'LBY1-2026',
    iat: now,
    exp: now + ACCESS_TOKEN_TTL_SECONDS,
    typ: 'access',
    ...overrides,
  }
}

describe('signJwt / verifyJwt', () => {
  it('produces a 3-part dot-separated token', async () => {
    const token = await signJwt(makePayload(), SECRET)
    expect(token.split('.')).toHaveLength(3)
  })

  it('round-trips the payload correctly', async () => {
    const payload = makePayload({ sub: 42, role: 'admin', code: 'LBY42-2026' })
    const token = await signJwt(payload, SECRET)
    const verified = await verifyJwt(token, SECRET)
    expect(verified).toEqual(payload)
  })

  it('rejects a token signed with a different secret', async () => {
    const token = await signJwt(makePayload(), SECRET)
    const verified = await verifyJwt(token, 'a-different-secret')
    expect(verified).toBeNull()
  })

  it('rejects an expired token', async () => {
    const payload = makePayload({ exp: nowSeconds() - 10 })
    const token = await signJwt(payload, SECRET)
    const verified = await verifyJwt(token, SECRET)
    expect(verified).toBeNull()
  })

  it('rejects a tampered payload (signature mismatch)', async () => {
    const token = await signJwt(makePayload(), SECRET)
    const [header, payload, sig] = token.split('.')
    const tamperedPayloadObj = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString())
    tamperedPayloadObj.role = 'super_admin'
    const tamperedPayload = Buffer.from(JSON.stringify(tamperedPayloadObj))
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')
    const tamperedToken = `${header}.${tamperedPayload}.${sig}`
    const verified = await verifyJwt(tamperedToken, SECRET)
    expect(verified).toBeNull()
  })

  it('rejects malformed tokens', async () => {
    expect(await verifyJwt('not-a-jwt', SECRET)).toBeNull()
    expect(await verifyJwt('a.b', SECRET)).toBeNull()
    expect(await verifyJwt('', SECRET)).toBeNull()
  })

  it('distinguishes access vs refresh token type in payload', async () => {
    const refreshPayload = makePayload({ typ: 'refresh', exp: nowSeconds() + REFRESH_TOKEN_TTL_SECONDS })
    const token = await signJwt(refreshPayload, SECRET)
    const verified = await verifyJwt(token, SECRET)
    expect(verified?.typ).toBe('refresh')
  })

})

describe('token TTL constants', () => {
  it('access token TTL is 15 minutes', () => {
    expect(ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60)
  })
  it('refresh token TTL is 30 days', () => {
    expect(REFRESH_TOKEN_TTL_SECONDS).toBe(30 * 24 * 60 * 60)
  })
})

describe('nowSeconds', () => {
  it('returns a unix timestamp close to Date.now()/1000', () => {
    const t = nowSeconds()
    expect(Math.abs(t - Math.floor(Date.now() / 1000))).toBeLessThanOrEqual(1)
  })
})

describe('verifyJwt with malformed input', () => {
  it('returns null instead of throwing', async () => {
    for (const bad of ['broken.access.token', 'a.b.c', '!!!.@@@.###', '', 'x', 'a.b', 'e30.e30.%%%']) {
      await expect(verifyJwt(bad, 'secret')).resolves.toBeNull()
    }
  })
})
