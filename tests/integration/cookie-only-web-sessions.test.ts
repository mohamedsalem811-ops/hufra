// The website's session lives only in HttpOnly cookies: the server never puts
// the tokens in a JSON body for a web page, so script in the page (e.g. an
// XSS bug) cannot read or copy them. The native app and API clients still get
// the tokens in the body.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const SITE = 'http://localhost' // app.request() URLs are http://localhost/...
const WEB = 'http://localhost:3000' // dev web page origin
let t: TestEnv

beforeEach(async () => {
  t = createTestEnv()
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'web@example.com', password: PW, consent: true }),
  })
})

/** Node's Headers has getSetCookie(); the Workers type definitions don't declare it. */
const setCookies = (res: Response): string[] => (res.headers as unknown as { getSetCookie(): string[] }).getSetCookie()

function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of setCookies(res)) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    out[pair.slice(0, i)] = pair.slice(i + 1)
  }
  return out
}
const cookieHeader = (jar: Record<string, string>) =>
  Object.entries(jar)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')

const login = (origin?: string) =>
  request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
    body: JSON.stringify({ email: 'web@example.com', password: PW }),
  })

describe('website (browser page) sessions', () => {
  it('login sets HttpOnly cookies and returns NO tokens in the body', async () => {
    for (const origin of [SITE, WEB]) {
      const res = await login(origin)
      expect(res.status).toBe(200)
      const body = await json(res)
      expect(body.user.email).toBe('web@example.com')
      expect(body).not.toHaveProperty('access_token')
      expect(body).not.toHaveProperty('refresh_token')
      const raw = setCookies(res)
      expect(raw.find((c) => c.startsWith('hufra_session='))).toMatch(/HttpOnly/)
      expect(raw.find((c) => c.startsWith('hufra_refresh='))).toMatch(/HttpOnly/)
      // The hint cookie is readable by scripts but contains no secret.
      expect(raw.find((c) => c.startsWith('hufra_auth='))).toMatch(/^hufra_auth=1;/)
      expect(raw.find((c) => c.startsWith('hufra_auth='))).not.toMatch(/HttpOnly/)
    }
  })

  it('works end to end with cookies only: me -> refresh -> me -> logout', async () => {
    let jar = cookiesFrom(await login(SITE))
    const me = (j: Record<string, string>) => request(t.env, '/api/auth/me', { headers: { Cookie: cookieHeader(j), Origin: SITE } })
    expect((await me(jar)).status).toBe(200)

    // Access cookie expired: refresh with the cookie alone.
    const { hufra_session: _expired, ...withoutAccess } = jar
    expect((await me(withoutAccess)).status).toBe(401)
    const refreshed = await request(t.env, '/api/auth/refresh', { method: 'POST', headers: { Cookie: cookieHeader(withoutAccess), Origin: SITE } })
    expect(refreshed.status).toBe(200)
    const body = await json(refreshed)
    expect(body).toEqual({ ok: true }) // a script calling refresh learns nothing
    jar = { ...withoutAccess, ...cookiesFrom(refreshed) }
    expect((await me(jar)).status).toBe(200)

    const out = await request(t.env, '/api/auth/logout', { method: 'POST', headers: { Cookie: cookieHeader(jar), Origin: SITE } })
    const cleared = cookiesFrom(out)
    expect(cleared).toMatchObject({ hufra_session: '', hufra_refresh: '', hufra_auth: '' })
    expect((await request(t.env, '/api/auth/refresh', { method: 'POST', headers: { Cookie: cookieHeader(jar), Origin: SITE } })).status).toBe(401)
  })
})

describe('native app and API clients still receive tokens', () => {
  it('the Capacitor app (capacitor:// and https://localhost origins)', async () => {
    for (const origin of ['capacitor://localhost', 'https://localhost']) {
      const body = await json(await login(origin))
      expect(body.access_token).toBeTruthy()
      expect(body.refresh_token).toBeTruthy()
      const r = await json(
        await request(t.env, '/api/auth/refresh', { method: 'POST', headers: { 'X-Refresh-Token': body.refresh_token, Origin: origin } })
      )
      expect(r.refresh_token).toBeTruthy()
    }
  })

  it('scripts and other non-browser clients (no Origin header)', async () => {
    const body = await json(await login())
    expect(body.access_token).toBeTruthy()
  })
})
