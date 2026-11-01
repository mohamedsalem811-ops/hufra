// KV's free tier allows 1,000 writes/day (deletes count). Rate limits now
// live in D1 and public caches in the edge cache (Cache API), so normal use
// of the site performs no KV writes at all.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

/** Minimal stand-in for Cloudflare's caches.default. */
class FakeEdgeCache {
  store = new Map<string, Response>()
  puts = 0
  async match(req: Request) {
    const hit = this.store.get(req.url)
    return hit ? hit.clone() : undefined
  }
  async put(req: Request, res: Response) {
    this.puts++
    this.store.set(req.url, res.clone())
  }
  async delete(req: Request) {
    return this.store.delete(req.url)
  }
}

let t: TestEnv
let edge: FakeEdgeCache
let kvWrites = 0

beforeEach(() => {
  t = createTestEnv()
  edge = new FakeEdgeCache()
  vi.stubGlobal('caches', { default: edge })
  kvWrites = 0
  const kv = t.kv as any
  for (const m of ['put', 'delete']) {
    const orig = kv[m].bind(kv)
    kv[m] = (...a: unknown[]) => {
      kvWrites++
      return orig(...a)
    }
  }
})
afterEach(() => vi.unstubAllGlobals())

const report = (lat = 32.8811) =>
  request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng: 13.3502, severity: 'medium' }),
  })

describe('KV write budget', () => {
  it('homepage reads, reports and logins use zero KV writes', async () => {
    for (let i = 0; i < 3; i++) {
      for (const p of ['/api/potholes/counters', '/api/potholes/showcase', '/api/potholes/top-reporter', '/api/potholes/recent-fixed']) {
        expect((await request(t.env, p)).status).toBe(200)
      }
      expect((await report(32.8811 + i * 0.01)).status).toBe(201)
    }
    await request(t.env, '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'nobody@example.com', password: 'whatever' }),
    })
    expect(kvWrites).toBe(0)
  })

  it('the report rate limit still applies (10 per IP per hour)', async () => {
    const statuses = []
    for (let i = 0; i < 11; i++) statuses.push((await report(32.80 + i * 0.002)).status)
    expect(statuses.slice(0, 10).every((s) => s === 201)).toBe(true)
    expect(statuses[10]).toBe(429)
  })
})

describe('edge cache for public reads', () => {
  it('serves repeated homepage counters from the cache', async () => {
    await report()
    const a = await json(await request(t.env, '/api/potholes/counters'))
    const b = await json(await request(t.env, '/api/potholes/counters'))
    expect(a).toEqual(b)
    expect(edge.puts).toBe(1) // computed once, then served from cache
  })

  it('a new report clears the cached counters so the next read is fresh', async () => {
    await report()
    expect((await json(await request(t.env, '/api/potholes/counters'))).totals.total).toBe(1)
    await report(32.90)
    expect((await json(await request(t.env, '/api/potholes/counters'))).totals.total).toBe(2)
  })
})
