// Fixed-window rate limiting backed by D1 (see migrations/0010_rate_limit_counters.sql).
//
// Each check is a single atomic statement:
//   INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count
// so concurrent requests can never all "see" the same count, and no KV write
// quota is used (KV's free tier is 1,000 writes/day; D1's is 100,000).
// Keys (IPs, user ids) are stored only as salted SHA-256 hashes.

import type { Bindings } from './types'

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetSeconds: number
}

/** Delete expired counters on roughly 1 in PRUNE_EVERY checks (Pages Functions have no cron). */
const PRUNE_EVERY = 50

async function bucketFor(scope: string, key: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${salt}:rl:${key}`))
  const hex = Array.from(new Uint8Array(digest).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${scope}:${hex}`
}

export async function checkRateLimit(
  env: Pick<Bindings, 'DB' | 'JWT_SECRET'>,
  scope: string,
  key: string,
  limit: number,
  windowSeconds: number,
  nowMs = Date.now()
): Promise<RateLimitResult> {
  const now = Math.floor(nowMs / 1000)
  const window = Math.floor(now / windowSeconds)
  const resetAt = (window + 1) * windowSeconds
  const bucket = await bucketFor(scope, key, env.JWT_SECRET || '')

  const row = await env.DB.prepare(
    `INSERT INTO rate_limit_counters (bucket, window_start, count, expires_at) VALUES (?, ?, 1, ?)
     ON CONFLICT(bucket, window_start) DO UPDATE SET count = count + 1
     RETURNING count`
  )
    .bind(bucket, window, resetAt)
    .first<{ count: number }>()
  const count = row?.count ?? 1

  if (Math.random() < 1 / PRUNE_EVERY) {
    await env.DB.prepare('DELETE FROM rate_limit_counters WHERE expires_at < ?').bind(now).run().catch(() => undefined)
  }

  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    resetSeconds: resetAt - now,
  }
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
export const UPVOTE_LIMIT_PER_IP = 30
export const UPVOTE_LIMIT_WINDOW_SECONDS = 60 * 60
