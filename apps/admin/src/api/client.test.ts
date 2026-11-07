import { okResponseSchema } from '@hufra/contracts'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { ApiError, createApiClient } from './client'

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

describe('api client', () => {
  it('sends cookies only to its own site and JSON bodies', async () => {
    const f = vi.fn(async () => json({ ok: true }))
    await createApiClient(f).request('/api/x', { method: 'POST', body: { a: 1 }, schema: okResponseSchema })
    const [path, init] = f.mock.calls[0] as unknown as [string, RequestInit]
    expect(path).toBe('/api/x')
    expect(init.credentials).toBe('same-origin')
    expect(init.body).toBe('{"a":1}')
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json')
  })

  it('refreshes the session once on 401, then repeats the request', async () => {
    let n = 0
    const f = vi.fn(async (path: string) => {
      if (path === '/api/auth/refresh') return json({ ok: true })
      return ++n === 1 ? json({ error: 'expired' }, 401) : json({ ok: true })
    })
    const out = await createApiClient(f as unknown as typeof fetch).request('/api/admin/reports', { schema: okResponseSchema })
    expect(out.ok).toBe(true)
    expect(f.mock.calls.map((c) => c[0])).toEqual(['/api/admin/reports', '/api/auth/refresh', '/api/admin/reports'])
  })

  it('shares one refresh between requests that fail together', async () => {
    let refreshes = 0
    const f = vi.fn(async (path: string) => {
      if (path === '/api/auth/refresh') {
        refreshes++
        return json({ ok: true })
      }
      return refreshes === 0 ? json({ error: 'expired' }, 401) : json({ ok: true })
    })
    const api = createApiClient(f as unknown as typeof fetch)
    await Promise.all([api.request('/api/a', { schema: okResponseSchema }), api.request('/api/b', { schema: okResponseSchema })])
    expect(refreshes).toBe(1)
  })

  it('reports a session that cannot be refreshed', async () => {
    const signedOut = vi.fn()
    const f = vi.fn(async () => json({ error: 'expired', error_ar: 'انتهت' }, 401))
    const err = await createApiClient(f, signedOut).request('/api/a', { schema: okResponseSchema }).catch((e) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err.kind).toBe('unauthorized')
    expect(err.messageAr).toBe('انتهت')
    expect(signedOut).toHaveBeenCalled()
  })

  it('does not treat a wrong password as a lost session', async () => {
    const signedOut = vi.fn()
    const f = vi.fn(async () => json({ error: 'Invalid credentials' }, 401))
    await createApiClient(f, signedOut).request('/api/auth/login', { method: 'POST', body: {}, schema: okResponseSchema }).catch(() => null)
    expect(f).toHaveBeenCalledTimes(1)
    expect(signedOut).not.toHaveBeenCalled()
  })

  it('names the kind of failure', async () => {
    const run = (f: () => Promise<Response>, schema: z.ZodType = okResponseSchema) =>
      createApiClient(f as unknown as typeof fetch).request('/api/a', { schema }).catch((e: ApiError) => e) as Promise<ApiError>
    expect((await run(async () => json({ error: 'no' }, 403))).kind).toBe('forbidden')
    const limited = await run(async () => json({ error: 'slow down' }, 429, { 'Retry-After': '90' }))
    expect([limited.kind, limited.status, limited.retryAfter]).toEqual(['http', 429, 90])
    expect((await run(async () => new Response('oops', { status: 502 }))).message).toBe('HTTP 502')
    expect((await run(async () => json({ unexpected: true }))).kind).toBe('contract')
    expect((await run(async () => Promise.reject(new TypeError('offline')))).kind).toBe('network')
  })

  it('lets a cancelled request stay cancelled', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' })
    const err = await createApiClient(async () => Promise.reject(abort)).request('/api/a', { schema: okResponseSchema }).catch((e) => e)
    expect(err).toBe(abort)
  })
})
