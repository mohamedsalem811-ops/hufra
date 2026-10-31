import type { Bindings } from './types'

/** Every KV key that backs a public (anonymous) read. Cleared whenever data changes. */
export const PUBLIC_CACHE_KEYS = ['counters:v1', 'top_reporter:v1', 'recent_fixed:v1', 'showcase:v1'] as const

export async function invalidatePublicCaches(kv: Bindings['KV']): Promise<void> {
  await Promise.allSettled(PUBLIC_CACHE_KEYS.map((k) => kv.delete(k)))
}
