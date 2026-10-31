// The API used to echo back ANY Origin with Access-Control-Allow-Credentials,
// so every website could make credentialed calls and read the responses.
import { describe, it, expect } from 'vitest'
import { createTestEnv, request } from './helpers/test-env'
import { isAllowedOrigin, isForbiddenCrossSiteWrite } from '../../src/lib/origins'

const SELF = 'http://localhost' // app.request() URLs resolve against http://localhost
const EVIL = ['https://evil.example', 'https://hufra-phish.pages.dev', 'null', 'http://localhost.evil.example']

function preflight(env: any, origin: string) {
  return request(env, '/api/potholes', {
    method: 'OPTIONS',
    headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'content-type' },
  })
}

describe('CORS on /api/*', () => {
  it('does not grant untrusted origins (including other *.pages.dev sites)', async () => {
    const { env } = createTestEnv()
    for (const origin of EVIL) {
      const res = await request(env, '/api/regions', { headers: { Origin: origin } })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
      expect((await preflight(env, origin)).headers.get('access-control-allow-origin')).toBeNull()
    }
  })

  it('allows the native app shells and local development', async () => {
    const { env } = createTestEnv()
    for (const origin of ['capacitor://localhost', 'https://localhost', 'http://localhost:3000', 'http://127.0.0.1:5173']) {
      const res = await preflight(env, origin)
      expect(res.headers.get('access-control-allow-origin')).toBe(origin)
      expect(res.headers.get('access-control-allow-credentials')).toBe('true')
    }
  })

  it('allows extra origins configured in ALLOWED_ORIGINS', async () => {
    const { env } = createTestEnv()
    const custom = { ...env, ALLOWED_ORIGINS: 'https://hufra.ly, https://www.hufra.ly/' }
    expect((await preflight(custom, 'https://www.hufra.ly')).headers.get('access-control-allow-origin')).toBe('https://www.hufra.ly')
    expect((await preflight(custom, 'https://hufra.ly.evil.example')).headers.get('access-control-allow-origin')).toBeNull()
  })
})

describe('cross-site write protection (CSRF)', () => {
  const report = JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium' })

  it('refuses POSTs sent from untrusted web pages', async () => {
    const { env, db } = createTestEnv()
    const res = await request(env, '/api/potholes', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: 'https://evil.example' },
      body: report,
    })
    expect(res.status).toBe(403)
    const n = await db.prepare('SELECT COUNT(*) AS n FROM potholes').first<{ n: number }>()
    expect(n?.n).toBe(0)
  })

  it('still accepts same-origin, native-app and Origin-less requests', async () => {
    const { env } = createTestEnv()
    for (const headers of [{ Origin: SELF }, { Origin: 'capacitor://localhost' }, {}]) {
      const res = await request(env, '/api/potholes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: report,
      })
      expect(res.status).toBe(201)
    }
  })

  it('never blocks reads', async () => {
    const { env } = createTestEnv()
    expect((await request(env, '/api/regions', { headers: { Origin: 'https://evil.example' } })).status).toBe(200)
  })
})

describe('origin helpers', () => {
  it('treats the serving domain as same-origin, whatever it is', () => {
    expect(isAllowedOrigin('https://abc123.hufra.pages.dev', 'https://abc123.hufra.pages.dev/api/x')).toBe(true)
    expect(isAllowedOrigin('https://hufra.pages.dev', 'https://abc123.hufra.pages.dev/api/x')).toBe(false)
    expect(isAllowedOrigin('', 'https://hufra.pages.dev/api/x')).toBe(false)
  })

  it('only checks unsafe methods', () => {
    expect(isForbiddenCrossSiteWrite('GET', 'https://evil.example', 'https://hufra.pages.dev/api/x')).toBe(false)
    expect(isForbiddenCrossSiteWrite('DELETE', 'https://evil.example', 'https://hufra.pages.dev/api/x')).toBe(true)
    expect(isForbiddenCrossSiteWrite('POST', undefined, 'https://hufra.pages.dev/api/x')).toBe(false)
  })
})
