// Viewing a report must not write to D1, and counters (views, upvotes) must
// not change a report's updated_at, which orders the homepage showcase.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv
beforeEach(() => {
  t = createTestEnv()
})

async function report(lat = 32.8811) {
  const res = await request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng: 13.3502, severity: 'medium' }),
  })
  return (await json(res)).id as number
}

const row = (id: number) => t.db.prepare('SELECT updated_at, view_count, upvotes_count FROM potholes WHERE id = ?').bind(id).first<any>()
const upvote = (id: number, ip = '203.0.113.1') =>
  request(t.env, `/api/potholes/${id}/upvote`, { method: 'POST', headers: { 'CF-Connecting-IP': ip } })
const pause = () => new Promise((r) => setTimeout(r, 5))

/** Count write statements reaching D1 during fn(). */
async function countWrites(fn: () => Promise<unknown>) {
  let writes = 0
  const real = t.db.prepare.bind(t.db)
  ;(t.env.DB as any).prepare = (sql: string) => {
    if (/^\s*(INSERT|UPDATE|DELETE)/i.test(sql)) writes++
    return real(sql)
  }
  try {
    await fn()
  } finally {
    ;(t.env.DB as any).prepare = real
  }
  return writes
}

describe('report views', () => {
  it('viewing a report performs no database writes and changes nothing', async () => {
    const id = await report()
    const before = await row(id)
    await pause()
    const writes = await countWrites(async () => {
      for (let i = 0; i < 5; i++) expect((await request(t.env, `/api/potholes/${id}`)).status).toBe(200)
    })
    expect(writes).toBe(0)
    expect(await row(id)).toEqual(before)
  })
})

describe('upvotes', () => {
  it('count once per person, even when sent many times at once', async () => {
    const id = await report()
    const results = await Promise.all(Array.from({ length: 8 }, () => upvote(id)))
    expect(results.filter((r) => r.status === 201)).toHaveLength(1)
    expect((await row(id)).upvotes_count).toBe(1)
    const again = await json(await upvote(id))
    expect(again).toMatchObject({ already_upvoted: true, upvotes_count: 1 })
    await upvote(id, '203.0.113.2')
    expect((await row(id)).upvotes_count).toBe(2)
  })

  it('do not change updated_at, so the homepage order is stable', async () => {
    const id = await report()
    const before = (await row(id)).updated_at
    await pause()
    await upvote(id)
    expect((await row(id)).updated_at).toBe(before)
  })

  it('are rate limited per IP (30 per hour)', async () => {
    const ids: number[] = []
    for (let i = 0; i < 4; i++) ids.push(await report(32.80 + i * 0.01))
    let last = 0
    for (let i = 0; i < 31; i++) last = (await upvote(ids[i % 4], '198.51.100.9')).status
    expect(last).toBe(429)
  })

  it('return 404 for deleted or missing reports', async () => {
    expect((await upvote(999)).status).toBe(404)
  })
})

describe('updated_at still tracks real changes', () => {
  it('changes when the report content or status changes', async () => {
    const id = await report()
    const before = (await row(id)).updated_at
    await pause()
    await t.db.prepare(`UPDATE potholes SET severity = 'severe' WHERE id = ?`).bind(id).run()
    const afterEdit = (await row(id)).updated_at
    expect(afterEdit > before).toBe(true)
    await pause()
    await t.db.prepare(`UPDATE potholes SET status = 'verified' WHERE id = ?`).bind(id).run()
    expect((await row(id)).updated_at > afterEdit).toBe(true)
  })
})
