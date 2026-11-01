import { Hono } from 'hono'
import type { Bindings } from '../lib/types'

// Same-origin, edge-cached map tile proxy.
//
// Why: loading tiles straight from openstreetmap.org means three DNS lookups
// and TLS handshakes to a volunteer-run server on every map page, with no
// control over caching. Serving them from our own origin gives one warm
// HTTP/2 connection and Cloudflare's edge cache (7 days) in front of OSM,
// which also keeps us a polite OSM citizen (cached requests never reach it).
//
// To switch provider later without a code change, set the TILE_UPSTREAM
// variable, e.g. https://api.maptiler.com/maps/streets/{z}/{x}/{y}.png?key=...
const DEFAULT_UPSTREAM = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const USER_AGENT = 'HUFRA/1.0 (community pothole reporting, Greater Tripoli; https://hufra.pages.dev)'
const MAX_AGE = 60 * 60 * 24 * 7

const tiles = new Hono<{ Bindings: Bindings }>()

function parseCoord(raw: string, max: number): number | null {
  if (!/^\d{1,7}$/.test(raw)) return null
  const n = Number(raw)
  return n >= 0 && n < max ? n : null
}

tiles.get('/:z/:x/:y', async (c) => {
  const z = parseCoord(c.req.param('z'), 20)
  if (z === null) return c.text('Bad tile', 400)
  const limit = 2 ** z
  const x = parseCoord(c.req.param('x'), limit)
  const yRaw = c.req.param('y').replace(/\.png$/, '')
  const y = parseCoord(yRaw, limit)
  if (x === null || y === null) return c.text('Bad tile', 400)

  const cache = typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  const cacheKey = new Request(new URL(c.req.url).origin + `/tiles/${z}/${x}/${y}.png`)
  if (cache) {
    const hit = await cache.match(cacheKey)
    // Cached responses have immutable headers; copy so middleware can add its own.
    if (hit) return new Response(hit.body, hit)
  }

  const template = c.env?.TILE_UPSTREAM || DEFAULT_UPSTREAM
  const upstreamUrl = template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y))

  let upstream: Response
  try {
    upstream = await fetch(upstreamUrl, { headers: { 'User-Agent': USER_AGENT, Accept: 'image/png,image/*' } })
  } catch {
    return new Response('Tile upstream unreachable', { status: 502, headers: { 'Cache-Control': 'no-store' } })
  }
  if (!upstream.ok) {
    return new Response('Tile unavailable', {
      status: upstream.status === 404 ? 404 : 502,
      headers: { 'Cache-Control': 'public, max-age=60' },
    })
  }

  const response = new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('Content-Type') || 'image/png',
      'Cache-Control': `public, max-age=${MAX_AGE}, s-maxage=${MAX_AGE}`,
      'Access-Control-Allow-Origin': '*',
    },
  })
  if (cache) {
    try {
      c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()))
    } catch {
      /* no execution context (tests): skip caching */
    }
  }
  return response
})

export default tiles
