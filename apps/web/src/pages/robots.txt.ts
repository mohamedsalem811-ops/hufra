// Plan 8.6: the admin panel and the API are not for search engines. Shared
// report pages stay crawlable so their "noindex" tag can be read.
import type { APIRoute } from 'astro'

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nDisallow: /admin\nDisallow: /api/\n\nSitemap: ${new URL('/sitemap.xml', site).href}\n`, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
