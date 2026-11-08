// Plan 9.1: security headers for each surface, from the Worker and in the static _headers file.
import { describe, it, expect } from 'vitest'
import { CSP, headersFor, staticHeadersFile, surfaceFor } from '../../src/lib/security-headers'
import { createTestEnv, request } from './helpers/test-env'

const directive = (csp: string, name: string) => csp.split(';').map((d) => d.trim()).find((d) => d.startsWith(`${name} `))

describe('surfaces', () => {
  it('sorts paths into website/admin, API and the old pages', () => {
    for (const p of ['/', '/en/', '/how', '/r/12', '/en/r/12', '/privacy', '/admin/', '/admin/reports', '/_astro/x.js', '/sitemap.xml']) expect(surfaceFor(p), p).toBe('site')
    for (const p of ['/api/regions', '/media/photos/1/a.webp', '/tiles/3/4/5.png']) expect(surfaceFor(p), p).toBe('api')
    for (const p of ['/map', '/report', '/pothole/7', '/login', '/account', '/trust', '/static/js/api.js', '/sw.js']) expect(surfaceFor(p), p).toBe('legacy')
    // Plan 9.2: the donation pages are the website's.
    for (const p of ['/donate/3', '/en/donate/3', '/donations', '/donations/4', '/sign-in']) expect(surfaceFor(p), p).toBe('site')
  })

  it('the website and admin policy allows only this site, with no inline scripts and no framing', () => {
    expect(directive(CSP.site, 'script-src')).toBe("script-src 'self'")
    expect(directive(CSP.site, 'script-src-attr')).toBe("script-src-attr 'none'")
    expect(directive(CSP.site, 'connect-src')).toBe("connect-src 'self'")
    expect(directive(CSP.site, 'frame-ancestors')).toBe("frame-ancestors 'none'")
    expect(CSP.site).not.toMatch(/unsafe-eval|https?:\/\//)
    expect(CSP.api).toMatch(/^default-src 'none'/)
    expect(headersFor('site')['X-Frame-Options']).toBe('DENY')
    expect(headersFor('site')['Permissions-Policy']).toContain('camera=()')
  })
})

describe('headers on responses', () => {
  it('the API, photos and tiles get the API policy', async () => {
    const { env } = createTestEnv()
    const res = await request(env, '/api/regions')
    expect(res.headers.get('content-security-policy')).toBe(CSP.api)
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(res.headers.get('strict-transport-security')).toContain('max-age=')
  })

  it('the old pages keep their own policy (Nominatim) until they are removed', async () => {
    const { env } = createTestEnv()
    const res = await request(env, '/map')
    expect(res.headers.get('content-security-policy')).toBe(CSP.legacy)
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN')
  })

  it('pages built from the static files keep working even though those headers are read-only', async () => {
    const { env } = createTestEnv()
    env.ASSETS = { fetch: async () => Object.freeze(await fetch('data:text/html,<p>admin</p>')) } as unknown as Fetcher
    const res = await request(env, '/admin/reports')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-security-policy')).toBe(CSP.site)
  })
})

describe('the static _headers file', () => {
  it('sets the site policy once, adds caching and indexing rules, and keeps the old files’ cache rules', () => {
    const file = staticHeadersFile('# old\n/static/vendor/*\n  Cache-Control: public, max-age=31536000, immutable\n')
    expect(file.match(/Content-Security-Policy:/g)).toHaveLength(1)
    expect(file).toContain(`/*\n  Strict-Transport-Security:`)
    expect(file).toContain(`  Content-Security-Policy: ${CSP.site}`)
    expect(file).toMatch(/\/_astro\/\*\n  Cache-Control: public, max-age=31536000, immutable/)
    expect(file).toMatch(/\/admin\/\*\n  X-Robots-Tag: noindex, nofollow/)
    expect(file).toContain('/static/vendor/*')
    expect(file).not.toContain('# old')
  })
})
