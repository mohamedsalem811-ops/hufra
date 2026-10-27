import { describe, it, expect, beforeEach } from 'vitest'
import { checkRateLimit } from '../../src/lib/rate-limit'
import { FakeKVNamespace } from '../integration/helpers/fake-bindings'

describe('checkRateLimit', () => {
  let kv: FakeKVNamespace

  beforeEach(() => {
    kv = new FakeKVNamespace()
  })

  it('allows requests under the limit', async () => {
    const result = await checkRateLimit(kv as any, 'test', 'ip1', 5, 3600)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(4)
  })

  it('decrements remaining on each call within the same window', async () => {
    const r1 = await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    const r2 = await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    const r3 = await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    expect(r1.allowed).toBe(true)
    expect(r2.allowed).toBe(true)
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('blocks requests once the limit is exceeded', async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    }
    const blocked = await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    expect(blocked.allowed).toBe(false)
    expect(blocked.remaining).toBe(0)
  })

  it('tracks separate counters per key', async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(kv as any, 'test', 'ip1', 3, 3600)
    }
    const otherKey = await checkRateLimit(kv as any, 'test', 'ip2', 3, 3600)
    expect(otherKey.allowed).toBe(true)
  })

  it('tracks separate counters per scope even with the same key', async () => {
    for (let i = 0; i < 3; i++) {
      await checkRateLimit(kv as any, 'scope_a', 'same-key', 3, 3600)
    }
    const otherScope = await checkRateLimit(kv as any, 'scope_b', 'same-key', 3, 3600)
    expect(otherScope.allowed).toBe(true)
  })

  it('returns a resetSeconds value that is positive and bounded by the window', async () => {
    const result = await checkRateLimit(kv as any, 'test', 'ip1', 5, 3600)
    expect(result.resetSeconds).toBeGreaterThan(0)
    expect(result.resetSeconds).toBeLessThanOrEqual(3600)
  })
})
