import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit } from '../../src/lib/rate-limit'
import { createMigratedTestDb, type MiniD1Database } from '../integration/helpers/d1-sqlite-adapter'

describe('checkRateLimit (D1-backed)', () => {
  let db: MiniD1Database
  let env: any

  beforeEach(() => {
    db = createMigratedTestDb()
    env = { DB: db, JWT_SECRET: 'unit-secret' }
  })

  it('allows requests under the limit', async () => {
    const result = await checkRateLimit(env, 'test', 'ip1', 5, 3600)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('counts down within a window and blocks once the limit is exceeded', async () => {
    const results = []
    for (let i = 0; i < 4; i++) results.push(await checkRateLimit(env, 'test', 'ip1', 3, 3600))
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false])
    expect(results.map((r) => r.remaining)).toEqual([2, 1, 0, 0])
  })

  it('cannot be bypassed by sending many requests at the same time', async () => {
    const burst = await Promise.all(Array.from({ length: 25 }, () => checkRateLimit(env, 'login', '203.0.113.9', 5, 900)))
    expect(burst.filter((r) => r.allowed)).toHaveLength(5)
  })

  it('tracks separate counters per key and per scope', async () => {
    for (let i = 0; i < 3; i++) await checkRateLimit(env, 'scope_a', 'ip1', 3, 3600)
    expect((await checkRateLimit(env, 'scope_a', 'ip2', 3, 3600)).allowed).toBe(true)
    expect((await checkRateLimit(env, 'scope_b', 'ip1', 3, 3600)).allowed).toBe(true)
    expect((await checkRateLimit(env, 'scope_a', 'ip1', 3, 3600)).allowed).toBe(false)
  })

  it('starts fresh in the next window', async () => {
    const t0 = Date.UTC(2026, 0, 1, 10, 0, 0)
    for (let i = 0; i < 3; i++) await checkRateLimit(env, 'test', 'ip1', 3, 60, t0)
    expect((await checkRateLimit(env, 'test', 'ip1', 3, 60, t0 + 30_000)).allowed).toBe(false)
    expect((await checkRateLimit(env, 'test', 'ip1', 3, 60, t0 + 61_000)).allowed).toBe(true)
  })

  it('returns a resetSeconds value that is positive and bounded by the window', async () => {
    const result = await checkRateLimit(env, 'test', 'ip1', 5, 3600)
    expect(result.resetSeconds).toBeGreaterThan(0)
    expect(result.resetSeconds).toBeLessThanOrEqual(3600)
  })

  it('never stores the raw IP address', async () => {
    await checkRateLimit(env, 'login', '198.51.100.77', 5, 900)
    const rows = JSON.stringify(db.raw.prepare('SELECT * FROM rate_limit_counters').all())
    expect(rows).not.toContain('198.51.100.77')
    expect(rows).toMatch(/"bucket":"login:[0-9a-f]{32}"/)
  })
})
