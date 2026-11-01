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

describe('page shell', () => {
  it('versions first-party assets and marks shared scripts for the router', async () => {
    const { env } = createTestEnv()
    const res = await request(env, '/map')
    const html = await res.text()
    expect(html).toMatch(/\/static\/css\/app\.css\?v=\w+/)
    expect(html).toMatch(/\/static\/js\/router\.js\?v=\w+" data-shared/)
    expect(html).toContain('id="main-content"')
    expect(html).not.toContain('tile.openstreetmap.org')
  })
})

describe('pothole detail page', () => {
  it('serves /pothole/0 (the shared template the native app build renders)', async () => {
    const { env } = createTestEnv()
    expect((await request(env, '/pothole/0')).status).toBe(200)
  })

  it('renders a numeric report id as a data attribute (no inline script)', async () => {
    const { env } = createTestEnv()
    const res = await request(env, '/pothole/42')
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('id="pothole-detail-root" data-pothole-id="42"')
  })

  it('refuses non-numeric ids instead of reflecting them into a script (XSS)', async () => {
    const { env } = createTestEnv()
    const payload = encodeURIComponent('</script><script>alert(1)</script>')
    const res = await request(env, `/pothole/${payload}`)
    expect(res.status).toBe(404)
    const html = await res.text()
    expect(html).not.toContain('<script>alert(1)')
    for (const bad of ['-1', '007', '1.5', '1e3', '12abc', '99999999999']) {
      expect((await request(env, `/pothole/${bad}`)).status).toBe(404)
    }
  })
})

describe('jsonForScript', () => {
  it('cannot be used to close an inline script element', async () => {
    const { jsonForScript } = await import('../../src/pages/layout')
    const out = jsonForScript({ s: '</script><b>&\u2028' })
    expect(out).not.toMatch(/[<>&\u2028]/)
    expect(JSON.parse(out)).toEqual({ s: '</script><b>&\u2028' })
  })
})

describe('Content-Security-Policy', () => {
  const PAGES = ['/', '/map', '/report', '/transparency', '/trust', '/login', '/register', '/account', '/admin', '/pothole/7']

  it('allows only same-origin script files: no inline scripts, no inline event handlers', async () => {
    const { env } = createTestEnv()
    const csp = (await request(env, '/')).headers.get('content-security-policy') || ''
    const scriptSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '))
    expect(scriptSrc).toBe("script-src 'self'")
    expect(csp).toContain("script-src-attr 'none'")
    expect(csp).not.toMatch(/script-src[^;]*unsafe-(inline|eval)/)
  })

  it('every page works under that policy: all <script> tags load files from this site', async () => {
    const { env } = createTestEnv()
    for (const page of PAGES) {
      const html = await (await request(env, page)).text()
      const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
      expect(scripts.length, page).toBeGreaterThan(0)
      for (const [, attrs, body] of scripts) {
        expect(attrs, `${page}: inline script`).toMatch(/\bsrc="\/static\//)
        expect(body.trim(), `${page}: script body`).toBe('')
      }
      expect(html, `${page}: inline handler`).not.toMatch(/\son[a-z]+=["']/i)
    }
  })
})
