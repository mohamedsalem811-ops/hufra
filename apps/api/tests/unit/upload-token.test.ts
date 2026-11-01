import { describe, it, expect } from 'vitest'
import { createUploadToken, verifyUploadToken, UPLOAD_TOKEN_TTL_SECONDS } from '../../src/lib/upload-token'
import { signJwt, nowSeconds } from '../../src/lib/jwt'

const SECRET = 'unit-secret'

describe('upload permits', () => {
  it('verify only for the same report, secret and before expiry', async () => {
    const tok = await createUploadToken(7, SECRET)
    expect(await verifyUploadToken(tok, 7, SECRET)).toBe(true)
    expect(await verifyUploadToken(tok, 8, SECRET)).toBe(false)
    expect(await verifyUploadToken(tok, 7, 'other-secret')).toBe(false)
    expect(await verifyUploadToken(tok, 7, SECRET, Date.now() + (UPLOAD_TOKEN_TTL_SECONDS + 5) * 1000)).toBe(false)
  })

  it('cannot be forged by editing the id or expiry', async () => {
    const [, exp, sig] = (await createUploadToken(7, SECRET)).split('.')
    expect(await verifyUploadToken(`8.${exp}.${sig}`, 8, SECRET)).toBe(false)
    expect(await verifyUploadToken(`7.${Number(exp) + 99999}.${sig}`, 7, SECRET)).toBe(false)
  })

  it('a login token is not an upload permit', async () => {
    const iat = nowSeconds()
    const jwt = await signJwt({ sub: 7, role: 'user', code: 'x', iat, exp: iat + 600, typ: 'access' }, SECRET)
    expect(await verifyUploadToken(jwt, 7, SECRET)).toBe(false)
    for (const junk of [undefined, null, 42, '', 'a.b.c', 'x'.repeat(500)]) {
      expect(await verifyUploadToken(junk, 7, SECRET)).toBe(false)
    }
  })
})
