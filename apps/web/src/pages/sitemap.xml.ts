// Plan 8.6: every public page in both languages, with each page's other-language twin.
import type { APIRoute } from 'astro'

import { href } from '../i18n/i18n'

// Arabic pages (no prefix); each has an English twin under /en. The 404 page
// and the shared-report template (/r/) are left out.
const PATHS = Object.keys(import.meta.glob('./**/*.astro'))
  .map((f) => f.replace(/^\.\//, '/').replace(/\.astro$/, '').replace(/\/index$/, '/') || '/')
  .filter((p) => !p.startsWith('/en') && p !== '/404' && !p.startsWith('/r/'))
  .map((p) => (p === '' ? '/' : p))
  .sort()

export const GET: APIRoute = ({ site }) => {
  const url = (p: string) => new URL(p, site).href
  const entries = PATHS.flatMap((p) =>
    (['ar', 'en'] as const).map((l) => {
      const alts = (['ar', 'en'] as const).map((a) => `<xhtml:link rel="alternate" hreflang="${a}" href="${url(href(a, p))}"/>`).join('')
      return `<url><loc>${url(href(l, p))}</loc>${alts}</url>`
    })
  )
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${entries.join('')}</urlset>\n`
  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
}
