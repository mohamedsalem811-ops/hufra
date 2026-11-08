import { describe, it, expect, vi, afterEach } from 'vitest'
import { createTestEnv, request } from './helpers/test-env'

describe('tile proxy', () => {
  afterEach(() => vi.restoreAllMocks())

  it('rejects out-of-range or malformed tile coordinates', async () => {
    const { env } = createTestEnv()
    expect((await request(env, '/tiles/25/1/1.png')).status).toBeGreaterThanOrEqual(400)
    expect((await request(env, '/tiles/3/9/1.png')).status).toBeGreaterThanOrEqual(400)
    expect((await request(env, '/tiles/3/a/1.png')).status).toBeGreaterThanOrEqual(400)
  })

  it('proxies a tile from the upstream with long cache headers', async () => {
    const { env } = createTestEnv()
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/png' } }))
    const res = await request({ ...env, TILE_UPSTREAM: 'https://tiles.test/{z}/{x}/{y}.png' }, '/tiles/3/4/2.png')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/png')
    expect(res.headers.get('cache-control')).toContain('max-age=604800')
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://tiles.test/3/4/2.png')
  })

  it('returns 502 when the upstream is unreachable', async () => {
    const { env } = createTestEnv()
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('down'))
    expect((await request(env, '/tiles/3/4/2.png')).status).toBe(502)
  })
})

describe('old website addresses (removed in plan 9.2)', () => {
  it('lead to the new pages', async () => {
    const { env } = createTestEnv()
    const cases: [string, string][] = [
      ['/map', '/'],
      ['/report', '/#download'],
      ['/trust', '/privacy'],
      ['/account', '/donations'],
      ['/register', '/sign-up'],
      ['/login', '/sign-in'],
      ['/login?redirect=%2Fdonate%2F3', '/sign-in?next=%2Fdonate%2F3'],
      ['/login?redirect=%2F%2Fevil.example', '/sign-in'],
      ['/pothole/42', '/r/42'],
    ]
    for (const [from, to] of cases) {
      const res = await request(env, from)
      expect(res.status, from).toBe(301)
      expect(res.headers.get('location'), from).toBe(to)
    }
  })

  it('refuses report ids that are not numbers, without echoing them (XSS)', async () => {
    const { env } = createTestEnv()
    const payload = encodeURIComponent('</script><script>alert(1)</script>')
    const res = await request(env, `/pothole/${payload}`)
    expect(res.status).toBe(404)
    expect(await res.text()).not.toContain('<script>alert(1)')
    for (const bad of ['0', '-1', '007', '1.5', '1e3', '12abc', '99999999999']) {
      expect((await request(env, `/pothole/${bad}`)).status, bad).toBe(404)
    }
  })

  it('the old pages, their files and the old app shell are gone', async () => {
    const { env } = createTestEnv()
    for (const path of ['/static/js/api.js', '/manifest.webmanifest', '/pothole/0', '/donate/abc']) {
      expect((await request(env, path)).status, path).toBe(404)
    }
  })
})

describe('Content-Security-Policy', () => {
  it('allows only same-origin script files: no inline scripts, no inline event handlers', async () => {
    const { env } = createTestEnv()
    const csp = (await request(env, '/')).headers.get('content-security-policy') || ''
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '))
    expect(scriptSrc).toBe("script-src 'self'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
  })
})
