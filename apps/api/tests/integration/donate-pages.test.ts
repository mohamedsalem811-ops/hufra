// The donation web pages (plan 6.9) are thin HTML shells filled in by
// /static/js/donate.js; check routing and the page contract (no inline
// scripts, so the strict CSP holds).
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createTestEnv, request } from './helpers/test-env'

const t = createTestEnv()

describe('donation pages', () => {
  it.each([
    ['/donate/12', 'campaign', '12'],
    ['/donations', 'mine', ''],
    ['/donations/7', 'donation', '7'],
  ])('%s renders the %s page', async (url, kind, id) => {
    const res = await request(t.env, url)
    expect(res.status).toBe(200)
    const html = await res.text()
    expect(html).toContain(`data-page="${kind}"`)
    expect(html).toContain(`data-id="${id}"`)
    expect(html).toMatch(/<script src="\/static\/js\/donate\.js\?v=[^"]+" defer><\/script>/)
    // No inline <script> blocks: only external, same-origin files may run.
    expect(html.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull()
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self'")
  })

  it('refuses ids that are not plain numbers', async () => {
    for (const url of ['/donate/abc', '/donate/0', '/donate/1e3', '/donations/-1']) {
      expect((await request(t.env, url)).status).toBe(404)
    }
  })

  it('ships the brand kit the pages link to', () => {
    const pub = path.resolve(__dirname, '../../public/static')
    for (const f of ['brand/tokens.css', 'brand/fonts/ReadexPro-Regular.ttf', 'brand/logo/lockup-horizontal-colour.svg', 'css/donate.css', 'js/donate.js']) {
      expect(fs.existsSync(path.join(pub, f)), f).toBe(true)
    }
  })
})
