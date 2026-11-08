// Plan 8.5: shared report links and Android App Links.
import { describe, it, expect, beforeEach } from 'vitest'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv
const H = (token?: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
const send = (method: string, p: string, body: unknown, token?: string) => request(t.env, p, { method, headers: H(token), body: JSON.stringify(body) })

const TEMPLATE = (lang: string) =>
  `<!doctype html><html lang="${lang}"><head><title>Shared report</title><meta name="description" content="generic"><!--share-meta--></head><body>page</body></html>`
const assetPaths: string[] = []
function withAssets() {
  t.env.ASSETS = {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(String(input)).pathname
      assetPaths.push(path)
      return new Response(TEMPLATE(path.startsWith('/en/') ? 'en' : 'ar'), { headers: { 'Content-Type': 'text/html' } })
    },
  } as unknown as Fetcher
}

async function reportOn(street: string) {
  await send('POST', '/api/auth/register', { email: 'r@example.com', password: PW, consent: true })
  const token = (await json(await send('POST', '/api/auth/login', { email: 'r@example.com', password: PW }))).access_token as string
  return (await json(await send('POST', '/api/potholes', { lat: 32.88, lng: 13.19, severity: 'severe', street_ar: street, street_en: 'Omar St' }, token))).id as number
}

beforeEach(() => {
  t = createTestEnv()
  assetPaths.length = 0
})

describe('/r/<id>', () => {
  it('opens the old report page until the website is served here', async () => {
    const res = await request(t.env, '/r/12')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('/pothole/12')
  })

  it('adds the report to the page for link previews, escaped, in both languages', async () => {
    withAssets()
    const id = await reportOn('شارع "النصر" <b>')
    const res = await request(t.env, `/r/${id}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const html = await res.text()
    expect(html).not.toContain('<!--share-meta-->')
    expect(html).toContain('<title>حفرة في شارع &#34;النصر&#34; &#60;b&#62;')
    expect(html).toContain('<meta property="og:title" content="حفرة في شارع &#34;النصر&#34; &#60;b&#62;')
    expect(html).toContain(`<meta property="og:url" content="http://localhost/r/${id}">`)
    expect(html).toContain('content="أُبلغ عنها · تابعها في تطبيق حفرة"')
    expect(html).not.toContain('<b>')

    const en = await (await request(t.env, `/en/r/${id}`)).text()
    expect(en).toContain('<title>Pothole on Omar St')
    expect(en).toContain(`content="http://localhost/en/r/${id}"`)
    expect(assetPaths).toEqual(['/r/', '/en/r/'])
  })

  it('says so for an unknown report, and refuses ids that are not numbers', async () => {
    withAssets()
    const res = await request(t.env, '/r/999')
    expect(res.status).toBe(404)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(await res.text()).toContain('<!--share-meta-->')
    expect((await request(t.env, '/r/abc')).status).toBe(404)
    expect((await request(t.env, '/r/0')).status).toBe(404)
  })

  it('shows the campaign in the preview and the share payload', async () => {
    withAssets()
    const id = await reportOn('شارع')
    await t.db.prepare(`INSERT INTO campaigns (pothole_id, status, target_millimes) VALUES (?, 'active', 1200000)`).bind(id).run()
    const shared = C.sharedReportResponseSchema.parse(await json(await request(t.env, `/api/potholes/${id}/share`)))
    expect(shared.campaign).toMatchObject({ target_lyd: 1200, confirmed_lyd: 0, pending_lyd: 0, donors: 0 })
    expect(await (await request(t.env, `/r/${id}`)).text()).toContain('جُمع 0 من 1,200 د.ل')
  })
})

describe('assetlinks.json', () => {
  it('lists only well-formed fingerprints, and nothing when none is set', async () => {
    expect(await json(await request(t.env, '/.well-known/assetlinks.json'))).toEqual([])
    t.env.ANDROID_CERT_SHA256 = 'fa:c6:17:45:dc:09:03:78:6f:b9:ed:e6:2a:96:2b:39:9f:73:48:f0:bb:6f:89:9b:83:32:66:75:91:03:3b:9c, nonsense'
    const res = await request(t.env, '/.well-known/assetlinks.json')
    expect(res.headers.get('content-type')).toContain('application/json')
    expect(await json(res)).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: 'ly.tripoli.hufra',
          sha256_cert_fingerprints: ['FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C'],
        },
      },
    ])
  })
})
