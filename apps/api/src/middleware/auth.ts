// Authentication + RBAC middleware for Hono.
//
// ASSUMPTION: D1/SQLite has no native "row-level security" engine like
// Postgres RLS. We reproduce the same *guarantee* (every table access is
// checked against the caller's role and ownership) by centralizing all
// authorization decisions here and in src/lib/authz.ts, and by having every
// route handler call these helpers rather than querying D1 directly with
// unchecked filters. This middleware never trusts client-supplied role
// claims beyond what is embedded in a server-signed JWT.

import type { Context, Next } from 'hono'
import { verifyJwt } from '../lib/jwt'
import type { AuthContext, Bindings, UserRole } from '../lib/types'

declare module 'hono' {
  interface ContextVariableMap {
    auth: AuthContext | null
  }
}

const COOKIE_NAME = 'hufra_session'

function extractToken(c: Context): string | null {
  const authHeader = c.req.header('Authorization')
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length)
  }
  const cookieHeader = c.req.header('Cookie')
  if (cookieHeader) {
    const match = cookieHeader
      .split(';')
      .map((p) => p.trim())
      .find((p) => p.startsWith(`${COOKIE_NAME}=`))
    if (match) return decodeURIComponent(match.split('=')[1])
  }
  return null
}

/** Populate c.get('auth') if a valid token is present; never blocks the request. */
export async function attachAuth(c: Context<{ Bindings: Bindings }>, next: Next) {
  const token = extractToken(c)
  if (!token) {
    c.set('auth', null)
    return next()
  }
  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload || payload.typ !== 'access') {
    c.set('auth', null)
    return next()
  }
  c.set('auth', { userId: payload.sub, role: payload.role, code: payload.code })
  return next()
}

/** Require any authenticated user. */
export function requireAuth() {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const auth = c.get('auth')
    if (!auth) {
      return c.json({ error: 'Authentication required', error_ar: 'يجب تسجيل الدخول' }, 401)
    }
    return next()
  }
}

/** Require one of the given roles. */
export function requireRole(...roles: UserRole[]) {
  return async (c: Context<{ Bindings: Bindings }>, next: Next) => {
    const auth = c.get('auth')
    if (!auth) {
      return c.json({ error: 'Authentication required', error_ar: 'يجب تسجيل الدخول' }, 401)
    }
    if (!roles.includes(auth.role)) {
      return c.json({ error: 'Forbidden', error_ar: 'غير مسموح' }, 403)
    }
    return next()
  }
}

export { COOKIE_NAME }
