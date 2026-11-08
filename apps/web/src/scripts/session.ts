// Signed-in pages of the website (plan 9.2): the donation steps and sign-in.
// The session lives in HttpOnly cookies set by /api/auth/login (the page's
// scripts never see a token); an expired session is renewed once with
// /api/auth/refresh before giving up.

import type { Locale } from '../i18n/i18n'
import { href } from '../i18n/i18n'

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly en: string | null,
    readonly ar: string | null,
  ) {
    super(en ?? `HTTP ${status}`)
  }
}

interface CallOptions {
  method?: 'GET' | 'POST'
  /** Sent as JSON. */
  body?: unknown
  /** Sent as multipart (file uploads). */
  form?: FormData
}

async function once<T>(path: string, opts: CallOptions): Promise<T> {
  const init: RequestInit = { method: opts.method ?? 'GET', credentials: 'same-origin', headers: { Accept: 'application/json' } }
  if (opts.form) init.body = opts.form
  else if (opts.body !== undefined) {
    init.headers = { ...init.headers, 'Content-Type': 'application/json' }
    init.body = JSON.stringify(opts.body)
  }
  let res: Response
  try {
    res = await fetch(path, init)
  } catch {
    throw new ApiError(0, null, null)
  }
  const text = await res.text()
  let data: Record<string, unknown> | null = null
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : null
  } catch {
    data = null
  }
  if (!res.ok) {
    const str = (v: unknown) => (typeof v === 'string' ? v : null)
    throw new ApiError(res.status, str(data?.error), str(data?.error_ar))
  }
  return data as T
}

/** True while the browser holds a session worth renewing (a non-secret marker cookie). */
const hasSession = () => document.cookie.split(';').some((c) => c.trim().startsWith('hufra_auth='))

/** Calls our API with the session cookies, renewing an expired session once. */
export async function call<T>(path: string, opts: CallOptions = {}): Promise<T> {
  try {
    return await once<T>(path, opts)
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 401 || !hasSession() || path.startsWith('/api/auth/')) throw err
    await once('/api/auth/refresh', { method: 'POST' }).catch(() => {
      throw err
    })
    return once<T>(path, opts)
  }
}

export interface SessionUser {
  id: number
  email: string
  role: 'user' | 'admin' | 'super_admin'
  display_name?: string | null
}

/** The signed-in person, or null. Other failures (offline) are thrown. */
export async function currentUser(): Promise<SessionUser | null> {
  if (!hasSession()) return null
  try {
    return (await call<{ user: SessionUser }>('/api/auth/me')).user
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null
    throw err
  }
}

/** The server's message in the page's language, or the fallback. */
export function errorText(locale: Locale, err: unknown, fallback: string): string {
  if (err instanceof ApiError && err.status > 0 && err.status !== 404) return (locale === 'ar' ? err.ar : err.en) ?? fallback
  return fallback
}

/** Only a path on this site ('/x'): never '//host' or '/\host', which browsers read as another site. */
export function safeNext(raw: string | null | undefined): string | null {
  if (!raw || raw.length > 300 || !/^\/(?![/\\])/.test(raw)) return null
  return raw
}

/** The sign-in page in this language, coming back to `next` (the current page by default). */
export function signInHref(locale: Locale, next = location.pathname, page: '/sign-in' | '/sign-up' = '/sign-in'): string {
  return `${href(locale, page)}?next=${encodeURIComponent(next)}`
}
