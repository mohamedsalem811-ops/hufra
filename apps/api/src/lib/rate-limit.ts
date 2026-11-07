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

// Rate limit policy (plan 7.2, tuned for app traffic).
//
// Libyan mobile carriers put many phones behind a few shared addresses
// (carrier-grade NAT), so for signed-in people the real limit is per account
// and the per-IP limit is only a high backstop against one network flooding
// us. Signed-out requests (the old website, until 9.2) keep the strict per-IP
// limits, because an IP is all there is to count.
const HOUR = 60 * 60

export const REPORT_LIMIT_PER_IP = 10 // signed out, per hour
export const REPORT_LIMIT_PER_USER = 15 // per account, per hour
export const REPORT_LIMIT_PER_SHARED_IP = 150 // signed in, all accounts on one address
export const REPORT_LIMIT_WINDOW_SECONDS = HOUR

export const UPLOAD_LIMIT_PER_IP = 30
export const UPLOAD_LIMIT_PER_USER = 40
export const UPLOAD_LIMIT_PER_SHARED_IP = 400
export const UPLOAD_LIMIT_WINDOW_SECONDS = HOUR

export const UPVOTE_LIMIT_PER_IP = 30
export const UPVOTE_LIMIT_PER_USER = 60
export const UPVOTE_LIMIT_PER_SHARED_IP = 600
export const UPVOTE_LIMIT_WINDOW_SECONDS = HOUR

// Guessing passwords is limited per account; the per-IP limit only stops one
// address trying many accounts, so it allows a whole carrier's sign-ins.
export const LOGIN_LIMIT_PER_IP = 60
export const LOGIN_LIMIT_PER_EMAIL = 10
export const LOGIN_LIMIT_WINDOW_SECONDS = 15 * 60

export const REGISTER_LIMIT_PER_IP = 30
export const REGISTER_LIMIT_WINDOW_SECONDS = HOUR

export interface Limit {
  scope: string
  key: string
  limit: number
  windowSeconds: number
}

/**
 * Checks several limits; the first one exceeded wins. Every check is counted,
 * so a refused request still uses up the others (no free probing).
 */
export async function checkLimits(env: Pick<Bindings, 'DB' | 'JWT_SECRET'>, limits: Limit[]): Promise<RateLimitResult> {
  let refused: RateLimitResult | null = null
  let tightest: RateLimitResult = { allowed: true, remaining: Number.MAX_SAFE_INTEGER, resetSeconds: 0 }
  for (const l of limits) {
    const r = await checkRateLimit(env, l.scope, l.key, l.limit, l.windowSeconds)
    if (!r.allowed && !refused) refused = r
    if (r.remaining < tightest.remaining) tightest = r
  }
  return refused ?? tightest
}

/** Signed in: per account plus a high shared-address backstop. Signed out: per IP. */
export function actorLimits(
  name: string,
  ip: string,
  userId: number | null | undefined,
  perUser: number,
  perSharedIp: number,
  perIp: number,
  windowSeconds: number
): Limit[] {
  if (userId) {
    return [
      { scope: `${name}_user`, key: String(userId), limit: perUser, windowSeconds },
      { scope: `${name}_ip_shared`, key: ip, limit: perSharedIp, windowSeconds },
    ]
  }
  return [{ scope: `${name}_ip`, key: ip, limit: perIp, windowSeconds }]
}

/**
 * The 429 answer: the app reads Retry-After to know when to send again
 * (reports waiting in the outbox) and shows a calm message meanwhile.
 */
export function tooMany(c: any, rl: RateLimitResult, error: string, error_ar: string) {
  const wait = Math.max(1, rl.resetSeconds)
  c.header('Retry-After', String(wait))
  return c.json({ error, error_ar, retry_after: wait }, 429)
}
