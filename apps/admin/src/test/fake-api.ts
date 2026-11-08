import type { Dashboard } from '@hufra/contracts'
import { vi } from 'vitest'

/** A dashboard answer with large numbers, to check digit formatting. */
export const DASHBOARD: Dashboard = {
  days: 30,
  tiles: {
    new_reports: 1240, new_reports_previous: 1200, awaiting_verification: 440, oldest_waiting_at: '2026-10-01T00:00:00.000Z',
    under_repair: 100, under_repair_regions: 3, fixed: 800, avg_fix_days: 4.5, confirmed_lyd: 12500.5, under_review_lyd: 300,
  },
  weekly: Array.from({ length: 12 }, (_, i) => ({ week_start: `2026-08-${String(10 + i).padStart(2, '0')}`, count: i * 3 })),
  by_status: { reported: 440, verified: 140, under_repair: 100, fixed: 800 },
  campaigns: { open: 2, missing_lyd: 1500 },
  todo: { stale_reports: 12, donations_to_review: 0, funded_campaigns: 1, duplicates: 3 },
  by_region: [{ id: 1, name_ar: 'سوق الجمعة', name_en: 'Souq Al-Jumaa', open: 40, fixed: 12, avg_fix_days: 3.2 }],
}

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
    if (path.startsWith('/api/admin/dashboard')) return json(DASHBOARD)
    return json({ error: 'Not found' }, 404)
  })
  return { fetch, state }
}
