import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireAuth } from '../middleware/auth'
import { pushTokenSchema } from '../lib/validation'
import { recordAudit } from '../lib/audit'

const notifications = new Hono<{ Bindings: Bindings }>()

notifications.use('*', attachAuth, requireAuth())

notifications.get('/', async (c) => {
  const authCtx = c.get('auth')!
  const isAdmin = authCtx.role === 'admin' || authCtx.role === 'super_admin'

  const rows = isAdmin
    ? await c.env.DB.prepare(
        `SELECT * FROM notifications
         WHERE (target_user_id = ? OR target_role IN ('admin', ?))
         ORDER BY created_at DESC LIMIT 50`
      )
        .bind(authCtx.userId, authCtx.role)
        .all()
    : await c.env.DB.prepare(
        `SELECT * FROM notifications
         WHERE target_user_id = ?
         ORDER BY created_at DESC LIMIT 50`
      )
        .bind(authCtx.userId)
        .all()

  const unread = isAdmin
    ? await c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM notifications
         WHERE (target_user_id = ? OR target_role IN ('admin', ?)) AND read_at IS NULL`
      )
        .bind(authCtx.userId, authCtx.role)
        .first<{ n: number }>()
    : await c.env.DB.prepare(
        `SELECT COUNT(*) as n FROM notifications
         WHERE target_user_id = ? AND read_at IS NULL`
      )
        .bind(authCtx.userId)
        .first<{ n: number }>()

  return c.json({ results: rows.results, unread_count: unread?.n ?? 0 })
})

notifications.post('/read-all', async (c) => {
  const authCtx = c.get('auth')!
  const isAdmin = authCtx.role === 'admin' || authCtx.role === 'super_admin'

  if (isAdmin) {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE (target_user_id = ? OR target_role IN ('admin', ?)) AND read_at IS NULL`
    )
      .bind(authCtx.userId, authCtx.role)
      .run()
  } else {
    await c.env.DB.prepare(
      `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE target_user_id = ? AND read_at IS NULL`
    )
      .bind(authCtx.userId)
      .run()
  }
  return c.json({ ok: true })
})

notifications.post('/push-token', async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = pushTokenSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid push token payload', error_ar: 'بيانات رمز الإشعارات غير صحيحة' }, 400)
  }

  const { platform, token, endpoint_json, locale } = parsed.data

  await c.env.DB.prepare(
    `INSERT INTO device_push_tokens (user_id, platform, token, endpoint_json, locale, active, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     ON CONFLICT(token) DO UPDATE SET
       user_id = excluded.user_id,
       platform = excluded.platform,
       endpoint_json = excluded.endpoint_json,
       locale = excluded.locale,
       active = 1,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')`
  )
    .bind(authCtx.userId, platform, token, endpoint_json ?? null, locale)
    .run()

  await recordAudit(c.env.DB, {
    actorId: authCtx.userId,
    action: 'push_token.register',
    entity: 'device_push_tokens',
    after: { platform, locale },
  })

  return c.json({ ok: true, platform }, 201)
})

notifications.delete('/push-token', async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const token = body && typeof body.token === 'string' ? body.token.trim() : null

  if (token) {
    await c.env.DB.prepare(
      `UPDATE device_push_tokens SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ? AND token = ?`
    )
      .bind(authCtx.userId, token)
      .run()
  } else {
    await c.env.DB.prepare(
      `UPDATE device_push_tokens SET active = 0, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE user_id = ?`
    )
      .bind(authCtx.userId)
      .run()
  }

  return c.json({ ok: true })
})

export default notifications
