// Fixed-window rate limiting backed by Cloudflare KV.
// Applied per-IP and per-user on the report endpoint (and login) to prevent
// spam/abuse per section 11. KV is eventually consistent but adequate for a
// soft rate limit; a persistent rate_limit_events table exists as a fallback
// audit trail (see migrations/0001_initial_schema.sql) but KV is the primary
// low-latency limiter.

import type { Bindings } from './types'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetSeconds: number
}

export async function checkRateLimit(
  kv: Bindings['KV'],
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Math.floor(Date.now() / 1000)
  const window = Math.floor(now / windowSeconds)
  const kvKey = `rl:${scope}:${key}:${window}`

  const current = await kv.get(kvKey)
  const count = current ? parseInt(current, 10) : 0

  if (count >= limit) {
    const resetSeconds = (window + 1) * windowSeconds - now
    return { allowed: false, remaining: 0, resetSeconds }
  }

  await kv.put(kvKey, String(count + 1), { expirationTtl: windowSeconds + 5 })
  return { allowed: true, remaining: limit - count - 1, resetSeconds: (window + 1) * windowSeconds - now }
}

// Rate limit policy constants (section 11: "Rate limiting on the report
// endpoint (per IP + user)").
export const REPORT_LIMIT_PER_IP = 10 // reports
export const REPORT_LIMIT_WINDOW_SECONDS = 60 * 60 // per hour
export const REPORT_LIMIT_PER_USER = 15
export const LOGIN_LIMIT_PER_IP = 10
export const LOGIN_LIMIT_WINDOW_SECONDS = 15 * 60
export const UPLOAD_LIMIT_PER_IP = 30
export const UPLOAD_LIMIT_WINDOW_SECONDS = 60 * 60
