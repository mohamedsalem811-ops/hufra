// Short-lived cache for the public, anonymous read endpoints (homepage
// counters, showcase, top reporter...). It uses Cloudflare's edge cache (the
// Cache API), not KV: KV's free tier allows only 1,000 writes per day, and
// refilling four 60-second KV entries alone could use over 5,000.
//
// The edge cache is per data centre and best-effort. Entries live
// PUBLIC_CACHE_TTL_SECONDS at most, and writes clear them in the data centre
// that handled the write. Elsewhere a change shows up within the TTL. Where no
// cache is available (local tests), values are simply computed every time.

export const PUBLIC_CACHE_TTL_SECONDS = 60

/** Every cache key that backs a public (anonymous) read. Cleared whenever data changes. */
export const PUBLIC_CACHE_KEYS = ['counters:v1', 'top_reporter:v1', 'recent_fixed:v1', 'showcase:v1'] as const
export type PublicCacheKey = (typeof PUBLIC_CACHE_KEYS)[number]

const CACHE_ORIGIN = 'https://public-cache.hufra.internal/'

function edgeCache(): Cache | undefined {
  try {
    return typeof caches !== 'undefined' ? (caches as unknown as { default?: Cache }).default : undefined
  } catch {
    return undefined
  }
}

/** Return the cached JSON for `key`, or compute it, cache it, and return it. */
export async function cachedJson<T>(
  key: PublicCacheKey,
  compute: () => Promise<T>,
  waitUntil?: (p: Promise<unknown>) => void
): Promise<T> {
  const cache = edgeCache()
  const req = new Request(CACHE_ORIGIN + key)
  if (cache) {
    const hit = await cache.match(req).catch(() => undefined)
    if (hit) return (await hit.json()) as T
  }
  const value = await compute()
  if (cache) {
    const res = new Response(JSON.stringify(value), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${PUBLIC_CACHE_TTL_SECONDS}` },
    })
    const put = cache.put(req, res).catch(() => undefined)
    if (waitUntil) waitUntil(put)
    else await put
  }
  return value
}

export async function invalidatePublicCaches(): Promise<void> {
  const cache = edgeCache()
  if (!cache) return
  await Promise.allSettled(PUBLIC_CACHE_KEYS.map((k) => cache.delete(new Request(CACHE_ORIGIN + k))))
}
