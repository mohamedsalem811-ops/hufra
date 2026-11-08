// Plan 9.1: one Worker for the API, the admin panel and the website.
import { describe, it, expect, beforeEach } from 'vitest'
import { CSP } from '../../src/lib/security-headers'
import { createTestEnv, request, type TestEnv } from './helpers/test-env'

let t: TestEnv
const FILES: Record<string, string> = {
  '/admin': '<!doctype html><title>HUFRA admin</title><div id="root"></div>',
  '/404': '<!doctype html><title>Not found</title><h1>الصفحة غير موجودة</h1>',
}
function withAssets() {
  t.env.ASSETS = {
    fetch: async (input: RequestInfo | URL) => {
      const body = FILES[new URL(String(input)).pathname]
      return body ? new Response(body, { headers: { 'Content-Type': 'text/html' } }) : new Response('nope', { status: 404 })
    },
  } as unknown as Fetcher
}
const html = { headers: { Accept: 'text/html,application/xhtml+xml' } }

beforeEach(() => {
  t = createTestEnv()
})

describe('with the website and admin panel built in', () => {
  beforeEach(withAssets)

  it('any admin screen address gets the admin page, never cached, under the site policy', async () => {
    for (const path of ['/admin/reports', '/admin/campaigns/3', '/admin/settings']) {
      const res = await request(t.env, path, html)
      expect(res.status, path).toBe(200)
      expect(await res.text()).toContain('HUFRA admin')
      expect(res.headers.get('cache-control')).toBe('no-cache')
      expect(res.headers.get('content-security-policy')).toBe(CSP.site)
      expect(res.headers.get('x-frame-options')).toBe('DENY')
    }
    expect((await request(t.env, '/admin/reports')).headers.get('x-robots-tag')).toBe('noindex, nofollow')
  })

  it('a missing admin file is a 404, not the page', async () => {
    expect((await request(t.env, '/admin/assets/index-old.js')).status).toBe(404)
  })

  it('old addresses lead to the new pages', async () => {
    const trust = await request(t.env, '/trust')
    expect(trust.status).toBe(301)
    expect(trust.headers.get('location')).toBe('/privacy')
    const report = await request(t.env, '/pothole/42')
    expect(report.status).toBe(301)
    expect(report.headers.get('location')).toBe('/r/42')
  })

  it('unknown pages show the website’s 404 page; the API keeps a plain answer', async () => {
    const page = await request(t.env, '/no-such-page', html)
    expect(page.status).toBe(404)
    expect(await page.text()).toContain('الصفحة غير موجودة')
    expect(page.headers.get('content-security-policy')).toBe(CSP.site)
    const api = await request(t.env, '/api/no-such-thing', html)
    expect(api.status).toBe(404)
    expect(api.headers.get('content-type')).toContain('text/plain')
  })

  it('the donation pages the app opens stay', async () => {
    expect((await request(t.env, '/donations', html)).status).toBe(200)
  })
})

describe('without the built files (local API, tests)', () => {
  it('keeps the old pages', async () => {
    expect((await request(t.env, '/admin')).status).toBe(200)
    expect((await request(t.env, '/trust')).status).toBe(200)
    expect((await request(t.env, '/pothole/5')).status).toBe(200)
    expect((await request(t.env, '/admin/reports')).status).toBe(404)
  })
})
