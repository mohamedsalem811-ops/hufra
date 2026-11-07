// Plan 7.2: limits tuned for app traffic. Many phones share one carrier
// address, so signed-in people are limited per account; the per-IP limits
// stay strict only for signed-out requests.
import { describe, it, expect, beforeEach } from 'vitest'
import { ANONYMOUS, createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const CARRIER = '102.164.0.7' // one shared address for everyone in these tests
let t: TestEnv
let n = 0

const send = (path: string, body: unknown, headers: Record<string, string> = {}) =>
  request(t.env, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': CARRIER, ...headers },
    body: JSON.stringify(body),
  })
async function account() {
  const email = `p${++n}@example.ly`
  await send('/api/auth/register', { email, password: PW, consent: true }, { 'CF-Connecting-IP': `10.0.0.${n}` })
  const body = await json(await send('/api/auth/login', { email, password: PW }, { 'CF-Connecting-IP': `10.0.0.${n}` }))
  return { email, token: body.access_token as string }
}
const report = (token: string | null, i: number) =>
  send('/api/potholes', { lat: 32.8 + i * 0.002, lng: 13.35, severity: 'medium' }, token ? { Authorization: `Bearer ${token}` } : { [ANONYMOUS]: '1' })

beforeEach(() => {
  t = createTestEnv()
  n = 0
})

describe('reports', () => {
  it('limit each account, not the carrier address everyone shares', async () => {
    const a = await account()
    const b = await account()
    for (let i = 0; i < 15; i++) expect((await report(a.token, i)).status).toBe(201)
    const refused = await report(a.token, 15)
    expect(refused.status).toBe(429)
    // A neighbour on the same address is not affected.
    expect((await report(b.token, 20)).status).toBe(201)
  })

  it('keep the strict per-address limit when signed out', async () => {
    for (let i = 0; i < 10; i++) expect((await report(null, i)).status).toBe(201)
    expect((await report(null, 10)).status).toBe(429)
  })

  it('say when to try again', async () => {
    const a = await account()
    for (let i = 0; i < 15; i++) await report(a.token, i)
    const res = await report(a.token, 15)
    const wait = Number(res.headers.get('Retry-After'))
    expect(wait).toBeGreaterThan(0)
    expect(wait).toBeLessThanOrEqual(3600)
    const body = await json(res)
    expect(body.retry_after).toBe(wait)
    expect(body.error_ar).toBeTruthy()
  })
})

describe('"I saw it too"', () => {
  it('lets many signed-in neighbours on one address confirm', async () => {
    const owner = await account()
    const res = await json(await report(owner.token, 0))
    // 31 different people on one address: more than the signed-out limit (30).
    for (let i = 0; i < 31; i++) {
      const p = await account()
      const vote = await send(`/api/potholes/${res.id}/upvote`, {}, { Authorization: `Bearer ${p.token}` })
      expect(vote.status, `person ${i}`).toBe(201)
    }
  })
})

describe('sign-in', () => {
  it('limits guesses per account, from any address', async () => {
    const a = await account() // signing up includes one sign-in
    for (let i = 0; i < 9; i++) {
      const res = await send('/api/auth/login', { email: a.email, password: 'wrong-Passw0rd!' }, { 'CF-Connecting-IP': `198.51.100.${i}` })
      expect(res.status).toBe(401)
    }
    const res = await send('/api/auth/login', { email: a.email, password: PW }, { 'CF-Connecting-IP': '198.51.100.99' })
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
  })

  it('lets a whole carrier sign in from one address', async () => {
    const people = []
    for (let i = 0; i < 12; i++) people.push(await account())
    for (const p of people) expect((await send('/api/auth/login', { email: p.email, password: PW })).status).toBe(200)
  })

  it('limits new accounts per address', async () => {
    let last = 0
    for (let i = 0; i < 31; i++) last = (await send('/api/auth/register', { email: `new${i}@example.ly`, password: PW, consent: true })).status
    expect(last).toBe(429)
  })
})

describe('request size and caching', () => {
  it('refuses an oversized API body', async () => {
    const res = await send('/api/auth/login', { email: 'a@b.ly', password: 'x'.repeat(70 * 1024) })
    expect(res.status).toBe(413)
    expect((await json(res)).error_ar).toBeTruthy()
  })

  it('marks API answers as different per signed-in person', async () => {
    const res = await request(t.env, '/api/regions')
    expect(res.headers.get('Vary')).toContain('Authorization')
  })
})
