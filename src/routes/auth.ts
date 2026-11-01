import { Hono } from 'hono'
import type { Bindings, UserRow } from '../lib/types'
import { registerSchema, loginSchema, changePasswordSchema } from '../lib/validation'
import { hashPassword, verifyPassword, isKnownPublicPassword } from '../lib/password'
import {
  signJwt,
  verifyJwt,
  nowSeconds,
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from '../lib/jwt'
import { checkRateLimit, LOGIN_LIMIT_PER_IP, LOGIN_LIMIT_WINDOW_SECONDS } from '../lib/rate-limit'
import { hashIp, recordAudit } from '../lib/audit'
import { COOKIE_NAME, attachAuth, requireAuth } from '../middleware/auth'

const auth = new Hono<{ Bindings: Bindings }>()

auth.use('*', attachAuth)

function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
}

async function hashToken(token: string): Promise<string> {
  const data = new TextEncoder().encode(token)
  const digest = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function setSessionCookies(c: any, accessToken: string, refreshToken: string) {
  const secure = new URL(c.req.url).protocol === 'https:'
  const base = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`
  c.header(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(accessToken)}; ${base}; Max-Age=${ACCESS_TOKEN_TTL_SECONDS}`,
    { append: true }
  )
  c.header(
    'Set-Cookie',
    `hufra_refresh=${encodeURIComponent(refreshToken)}; ${base}; Max-Age=${REFRESH_TOKEN_TTL_SECONDS}`,
    { append: true }
  )
}

async function extractRefreshToken(c: any): Promise<string | null> {
  const headerToken = c.req.header('X-Refresh-Token')
  if (headerToken) return headerToken.trim()

  const contentType = c.req.header('Content-Type') || ''
  if (contentType.includes('application/json')) {
    const body = await c.req.json().catch(() => null)
    if (body && typeof body.refresh_token === 'string' && body.refresh_token.trim()) {
      return body.refresh_token.trim()
    }
  }

  const cookieHeader = c.req.header('Cookie') || ''
  const match = cookieHeader
    .split(';')
    .map((p: string) => p.trim())
    .find((p: string) => p.startsWith('hufra_refresh='))
  if (match) {
    return decodeURIComponent(match.split('=')[1])
  }

  return null
}

/**
 * Seconds during which a just-rotated refresh token is still treated as a
 * benign race (two tabs or two parallel requests refreshing at once) rather
 * than as reuse of a stolen token.
 */
export const REFRESH_REUSE_GRACE_SECONDS = 60

/** Sign a new access + refresh token pair, record the refresh token and set the cookies. */
async function issueSession(
  c: any,
  user: { id: number; role: UserRow['role']; code: string },
  ipHash: string | null
): Promise<{ accessToken: string; refreshToken: string }> {
  const iat = nowSeconds()
  const expRefresh = iat + REFRESH_TOKEN_TTL_SECONDS
  const accessToken = await signJwt(
    { sub: user.id, role: user.role, code: user.code, iat, exp: iat + ACCESS_TOKEN_TTL_SECONDS, typ: 'access' },
    c.env.JWT_SECRET
  )
  const refreshToken = await signJwt(
    { sub: user.id, role: user.role, code: user.code, iat, exp: expRefresh, typ: 'refresh', jti: crypto.randomUUID() },
    c.env.JWT_SECRET
  )
  await c.env.DB.prepare(
    `INSERT INTO refresh_tokens (user_id, token_hash, user_agent, ip_hash, expires_at) VALUES (?, ?, ?, ?, ?)`
  )
    .bind(user.id, await hashToken(refreshToken), c.req.header('User-Agent') ?? null, ipHash, new Date(expRefresh * 1000).toISOString())
    .run()
  await setSessionCookies(c, accessToken, refreshToken)
  return { accessToken, refreshToken }
}

function clearSessionCookies(c: any) {
  const secure = new URL(c.req.url).protocol === 'https:'
  const base = `Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}; Max-Age=0`
  c.header('Set-Cookie', `${COOKIE_NAME}=; ${base}`, { append: true })
  c.header('Set-Cookie', `hufra_refresh=; ${base}`, { append: true })
}

function refreshDenied(c: any, error: string, error_ar: string) {
  clearSessionCookies(c)
  return c.json({ error, error_ar }, 401)
}

auth.post('/register', async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = registerSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة', details: parsed.error.issues }, 400)
  }
  const { email, password, locale, display_name } = parsed.data

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first()
  if (existing) {
    return c.json({ error: 'Email already registered', error_ar: 'البريد الإلكتروني مستخدم من قبل' }, 409)
  }

  const passwordHash = await hashPassword(password)
  const result = await c.env.DB.prepare(
    `INSERT INTO users (email, password_hash, role, code, locale, display_name, consent_at)
     VALUES (?, ?, 'user', '', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
  )
    .bind(email, passwordHash, locale, display_name ?? null)
    .run()

  const userId = result.meta.last_row_id as number
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first<UserRow>()

  await recordAudit(c.env.DB, { actorId: userId, action: 'user.register', entity: 'users', entityId: userId })

  return c.json({
    user: { id: user!.id, email: user!.email, code: user!.code, role: user!.role, locale: user!.locale },
  }, 201)
})

auth.post('/login', async (c) => {
  const ip = clientIp(c)
  const rl = await checkRateLimit(c.env.KV, 'login', ip, LOGIN_LIMIT_PER_IP, LOGIN_LIMIT_WINDOW_SECONDS)
  if (!rl.allowed) {
    return c.json({ error: 'Too many login attempts, please try again later', error_ar: 'محاولات كثيرة جداً، حاول لاحقاً' }, 429)
  }

  const body = await c.req.json().catch(() => null)
  const parsed = loginSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  }
  const { email, password } = parsed.data

  const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(email)
    .first<UserRow>()

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return c.json({ error: 'Invalid credentials', error_ar: 'بيانات الدخول غير صحيحة' }, 401)
  }

  // A password that has been published (e.g. the old default admin password in
  // this repository) is no protection at all, so it never opens a session even
  // when it matches the stored hash. The owner sets a new one out-of-band with
  // `npm run admin:set-password`.
  if (isKnownPublicPassword(password)) {
    return c.json(
      {
        error: 'This password is publicly known and has been disabled. Set a new one with `npm run admin:set-password`.',
        error_ar: 'كلمة المرور هذه منشورة علناً وتم تعطيلها. عيّن كلمة مرور جديدة عبر npm run admin:set-password',
      },
      403
    )
  }

  const ipHashed = await hashIp(ip, c.env.JWT_SECRET)
  const { accessToken, refreshToken } = await issueSession(c, user, ipHashed)
  await recordAudit(c.env.DB, { actorId: user.id, action: 'user.login', entity: 'users', entityId: user.id, ipHash: ipHashed })

  return c.json({
    access_token: accessToken,
    refresh_token: refreshToken,
    user: { id: user.id, email: user.email, code: user.code, role: user.role, locale: user.locale, display_name: user.display_name },
  })
})

// Refresh-token rotation: each refresh token works exactly once. A successful
// refresh retires it and returns a new one. Presenting a retired token again
// (after a short grace period for parallel requests) means someone else holds
// a copy, so every session of that account is signed out.
auth.post('/refresh', async (c) => {
  const token = await extractRefreshToken(c)
  if (!token) return c.json({ error: 'No refresh token', error_ar: 'لا يوجد رمز تحديث' }, 401)

  const payload = await verifyJwt(token, c.env.JWT_SECRET)
  if (!payload || payload.typ !== 'refresh') {
    return refreshDenied(c, 'Invalid refresh token', 'رمز التحديث غير صالح')
  }

  const stored = await c.env.DB.prepare(
    'SELECT id, user_id, revoked_at, replaced_at FROM refresh_tokens WHERE token_hash = ?'
  )
    .bind(await hashToken(token))
    .first<{ id: number; user_id: number; revoked_at: string | null; replaced_at: string | null }>()

  // Only tokens this server issued and recorded are accepted.
  if (!stored || stored.user_id !== payload.sub) {
    return refreshDenied(c, 'Invalid refresh token', 'رمز التحديث غير صالح')
  }

  if (stored.revoked_at !== null) {
    const retiredFor = stored.replaced_at ? nowSeconds() - Math.floor(Date.parse(stored.replaced_at) / 1000) : null
    if (retiredFor !== null && retiredFor > REFRESH_REUSE_GRACE_SECONDS) {
      // A token retired by rotation is being used again: it was copied. End every session.
      await c.env.DB.prepare(
        `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL`
      )
        .bind(stored.user_id)
        .run()
      await recordAudit(c.env.DB, {
        actorId: stored.user_id,
        action: 'session.refresh_token_reuse',
        entity: 'users',
        entityId: stored.user_id,
        ipHash: await hashIp(clientIp(c), c.env.JWT_SECRET),
      })
      return refreshDenied(c, 'Session expired, please log in again', 'انتهت الجلسة، يرجى تسجيل الدخول من جديد')
    }
    return refreshDenied(c, 'Refresh token revoked', 'تم إلغاء رمز التحديث')
  }

  const currentUser = await c.env.DB.prepare(
    'SELECT id, role, code FROM users WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(payload.sub)
    .first<{ id: number; role: UserRow['role']; code: string }>()
  if (!currentUser) {
    return refreshDenied(c, 'User not found', 'المستخدم غير موجود')
  }

  // Claim the token atomically: if two requests race with the same token,
  // only the one whose UPDATE changes the row gets a new session.
  const claimed = await c.env.DB.prepare(
    `UPDATE refresh_tokens
     SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), replaced_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND revoked_at IS NULL`
  )
    .bind(stored.id)
    .run()
  if (!claimed.meta.changes) {
    // Lost a race with a parallel refresh: the other request already set the new cookies.
    return c.json({ error: 'Refresh token already used', error_ar: 'تم استخدام رمز التحديث مسبقاً' }, 401)
  }

  const { accessToken, refreshToken } = await issueSession(c, currentUser, await hashIp(clientIp(c), c.env.JWT_SECRET))
  return c.json({ access_token: accessToken, refresh_token: refreshToken })
})

auth.post('/logout', async (c) => {
  const token = await extractRefreshToken(c)
  if (token) {
    const tokenHash = await hashToken(token)
    await c.env.DB.prepare(
      `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE token_hash = ?`
    )
      .bind(tokenHash)
      .run()
  }
  clearSessionCookies(c)
  return c.json({ ok: true })
})

auth.post('/change-password', requireAuth(), async (c) => {
  const authCtx = c.get('auth')!
  const ip = clientIp(c)
  const rl = await checkRateLimit(c.env.KV, 'chpw', String(authCtx.userId), 5, 15 * 60)
  if (!rl.allowed) {
    return c.json({ error: 'Too many attempts, please try again later', error_ar: 'محاولات كثيرة جداً، حاول لاحقاً' }, 429)
  }
  const body = await c.req.json().catch(() => null)
  const parsed = changePasswordSchema.safeParse(body)
  if (!parsed.success) {
    if (typeof body?.new_password === 'string' && isKnownPublicPassword(body.new_password)) {
      return c.json({ error: 'This password is publicly known; choose another one', error_ar: 'كلمة المرور هذه منشورة علناً، اختر غيرها' }, 400)
    }
    return c.json({ error: 'Password must be at least 8 characters', error_ar: 'كلمة المرور 8 أحرف على الأقل' }, 400)
  }
  const user = await c.env.DB.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL').bind(authCtx.userId).first<UserRow>()
  if (!user || !(await verifyPassword(parsed.data.current_password, user.password_hash))) {
    return c.json({ error: 'Current password is incorrect', error_ar: 'كلمة المرور الحالية غير صحيحة' }, 401)
  }
  const newHash = await hashPassword(parsed.data.new_password)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, user.id).run()
  // Sign out every other session: revoke all refresh tokens issued so far.
  await c.env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL`
  )
    .bind(user.id)
    .run()
  await recordAudit(c.env.DB, {
    actorId: user.id,
    action: 'user.change_password',
    entity: 'users',
    entityId: user.id,
    ipHash: await hashIp(ip, c.env.JWT_SECRET),
  })
  return c.json({ ok: true })
})

auth.get('/me', requireAuth(), async (c) => {
  const authCtx = c.get('auth')!
  const user = await c.env.DB.prepare(
    'SELECT id, email, role, code, locale, display_name, totp_enabled, created_at FROM users WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(authCtx.userId)
    .first()
  if (!user) return c.json({ error: 'User not found', error_ar: 'المستخدم غير موجود' }, 404)
  return c.json({ user })
})

auth.get('/me/export', requireAuth(), async (c) => {
  const authCtx = c.get('auth')!
  const user = await c.env.DB.prepare(
    'SELECT id, email, role, code, locale, display_name, created_at FROM users WHERE id = ?'
  )
    .bind(authCtx.userId)
    .first()
  const potholes = await c.env.DB.prepare('SELECT * FROM potholes WHERE reporter_id = ? AND deleted_at IS NULL')
    .bind(authCtx.userId)
    .all()
  return c.json({ user, reports: potholes.results })
})

// Delete my account (GDPR-style erasure). Personal data is removed, not just
// hidden: the email becomes deleted-<id>@deleted.invalid (so the address can
// be registered again), the password hash, display name and 2FA secret are
// wiped, the phone number is removed from the person's reports, and their
// devices, notifications and session details are deleted. The reports
// themselves stay public (they describe roads, not people) but no longer
// link to anyone. Everything runs in one transaction.
auth.post('/me/delete', requireAuth(), async (c) => {
  const authCtx = c.get('auth')!
  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE id = ? AND deleted_at IS NULL')
    .bind(authCtx.userId)
    .first<{ id: number; role: UserRow['role'] }>()
  if (!user) return c.json({ error: 'User not found', error_ar: 'المستخدم غير موجود' }, 404)

  if (user.role === 'super_admin') {
    const others = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND id != ?`
    )
      .bind(user.id)
      .first<{ n: number }>()
    if ((others?.n ?? 0) < 1) {
      return c.json(
        {
          error: 'You are the last super admin: promote another super admin before deleting this account',
          error_ar: 'أنت آخر مسؤول عام: عيّن مسؤولاً عاماً آخر قبل حذف هذا الحساب',
        },
        400
      )
    }
  }

  const db = c.env.DB
  const id = user.id
  await db.batch([
    db.prepare(`UPDATE potholes SET reporter_contact = NULL, reporter_id = NULL WHERE reporter_id = ?`).bind(id),
    db.prepare(`DELETE FROM device_push_tokens WHERE user_id = ?`).bind(id),
    db.prepare(`DELETE FROM notifications WHERE target_user_id = ?`).bind(id),
    db.prepare(
      `UPDATE refresh_tokens SET user_agent = NULL, ip_hash = NULL,
         revoked_at = COALESCE(revoked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
       WHERE user_id = ?`
    ).bind(id),
    db.prepare(
      `UPDATE users SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
         email = 'deleted-' || id || '@deleted.invalid', password_hash = '!deleted',
         display_name = NULL, totp_secret = NULL, totp_enabled = 0, role = 'user'
       WHERE id = ?`
    ).bind(id),
  ])
  await recordAudit(db, { actorId: id, action: 'user.self_delete', entity: 'users', entityId: id })
  clearSessionCookies(c)
  return c.json({ ok: true })
})

export default auth
