import { vi } from 'vitest'

/** A tiny stand-in for the HUFRA API with a cookie session. */
export function fakeApi(opts: { role?: 'user' | 'admin' | 'super_admin'; signedIn?: boolean; password?: string } = {}) {
  const state = { signedIn: opts.signedIn ?? false, role: opts.role ?? 'admin', loggedOut: 0 }
  const password = opts.password ?? 'right-Passw0rd'
  const user = () => ({
    id: 3,
    email: 'staff@hufra.ly',
    code: 'HF-3',
    role: state.role,
    locale: 'ar',
    display_name: 'سالم',
  })
  const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input)
    const method = init?.method ?? 'GET'
    if (path === '/api/auth/me') return state.signedIn ? json({ user: { ...user(), totp_enabled: 0, created_at: '2026-10-01T00:00:00.000Z' } }) : json({ error: 'Authentication required' }, 401)
    if (path === '/api/auth/refresh') return json({ error: 'No refresh token' }, 401)
    if (path === '/api/auth/login' && method === 'POST') {
      const body = JSON.parse(String(init?.body))
      if (body.password === 'too-many') return json({ error: 'Too many', error_ar: 'كثير' }, 429, { 'Retry-After': '120' })
      if (body.password !== password) return json({ error: 'Invalid credentials', error_ar: 'بيانات الدخول غير صحيحة' }, 401)
      state.signedIn = true
      return json({ user: user() })
    }
    if (path === '/api/auth/logout') {
      state.signedIn = false
      state.loggedOut++
      return json({ ok: true })
    }
    if (path === '/api/potholes/counters') {
      return json({ totals: { total: 1240, fixed: 800, reported: 200, verified: 140, under_repair: 100 }, by_region: [], avg_response_days: 4 })
    }
    return json({ error: 'Not found' }, 404)
  })
  return { fetch, state }
}
