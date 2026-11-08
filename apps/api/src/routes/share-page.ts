// Plan 8.5: shared report links (/r/<id>, /en/r/<id>) and the file that lets
// Android open them straight in the app (/.well-known/assetlinks.json).
//
// The page itself is the website's /r/ template (built by apps/web). The
// Worker adds the report's title, description and photo to it, so link
// previews (WhatsApp, Facebook...) show the report without running scripts.
// Until the website is served from this Worker (plan 9.1) there is no
// template, and the link opens the old report page instead.
import type { SharedReport } from '@hufra/contracts'
import { Hono } from 'hono'

import { loadSharedReport } from '../lib/shared-report'
import type { Bindings } from '../lib/types'

export const ANDROID_PACKAGE = 'ly.tripoli.hufra'
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/
const MARKER = '<!--share-meta-->'

const STATUS = {
  ar: { reported: 'أُبلغ عنها', verified: 'تم التحقق', under_repair: 'قيد الإصلاح', fixed: 'تم الإصلاح' },
  en: { reported: 'Reported', verified: 'Verified', under_repair: 'Being repaired', fixed: 'Fixed' },
} as const

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`)

/** Title, description and image for link previews, in the page's language. */
export function shareMeta(r: SharedReport, locale: 'ar' | 'en', origin: string) {
  const ar = locale === 'ar'
  const street = (ar ? r.street_ar || r.street_en : r.street_en || r.street_ar) || null
  const region = ar ? r.region_name_ar : r.region_name_en
  const place = [street, region].filter(Boolean).join(ar ? '، ' : ', ')
  const title = ar ? `حفرة في ${place}` : `Pothole on ${place}`
  const status = STATUS[locale][r.status as keyof (typeof STATUS)['ar']] ?? r.status
  const parts: string[] = [status]
  if (r.campaign) {
    const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
    parts.push(ar ? `جُمع ${fmt.format(r.campaign.confirmed_lyd)} من ${fmt.format(r.campaign.target_lyd)} د.ل` : `${fmt.format(r.campaign.confirmed_lyd)} of ${fmt.format(r.campaign.target_lyd)} LYD raised`)
  }
  parts.push(ar ? 'تابعها في تطبيق حفرة' : 'Follow it in the HUFRA app')
  const photo = r.status === 'fixed' && r.photo_after ? r.photo_after : r.photo_before
  return {
    title: `${title} · ${ar ? 'حفرة' : 'HUFRA'}`,
    description: parts.join(' · '),
    image: photo ? `${origin}/media/${photo.r2_key}` : null,
    url: `${origin}${ar ? '' : '/en'}/r/${r.id}`,
  }
}

/** Puts the preview tags into the template (all values escaped). */
export function fillTemplate(html: string, meta: ReturnType<typeof shareMeta>, locale: 'ar' | 'en'): string {
  const tags = [
    `<meta property="og:type" content="article">`,
    `<meta property="og:site_name" content="${locale === 'ar' ? 'حفرة' : 'HUFRA'}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}">`,
    `<meta property="og:locale" content="${locale === 'ar' ? 'ar_LY' : 'en_GB'}">`,
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}">` : '',
    `<meta name="twitter:card" content="${meta.image ? 'summary_large_image' : 'summary'}">`,
  ].join('')
  return html
    .replace(MARKER, tags)
    .replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(meta.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${escapeHtml(meta.description)}">`)
}

export const sharePage = new Hono<{ Bindings: Bindings }>()

async function render(c: any, raw: string, locale: 'ar' | 'en') {
  if (!/^[1-9]\d{0,9}$/.test(raw)) return c.notFound()
  const id = Number(raw)
  const origin = new URL(c.req.url).origin
  const env = c.env as Bindings
  const template = env.ASSETS ? await env.ASSETS.fetch(new URL(locale === 'ar' ? '/r/' : '/en/r/', origin)).catch(() => null) : null
  if (!template || !template.ok) return c.redirect(`/pothole/${id}`, 302)
  const html = await template.text()
  const report = await loadSharedReport(env.DB, id, origin)
  // An unknown or removed report still gets the page: it says so itself (and is not cached).
  if (!report) return c.html(html, 404, { 'Cache-Control': 'no-store' })
  return c.html(fillTemplate(html, shareMeta(report, locale, origin), locale), 200, { 'Cache-Control': 'public, max-age=300' })
}

sharePage.get('/r/:id', (c) => render(c, c.req.param('id'), 'ar'))
sharePage.get('/en/r/:id', (c) => render(c, c.req.param('id'), 'en'))

// Android App Links: which signed builds of the app may open /r/ links directly.
sharePage.get('/.well-known/assetlinks.json', (c) => {
  const prints = (c.env.ANDROID_CERT_SHA256 ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s) => FINGERPRINT.test(s))
  c.header('Cache-Control', 'public, max-age=3600')
  return c.json(
    prints.length
      ? [{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: prints } }]
      : []
  )
})
