import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireAuth } from '../middleware/auth'
import { pushTokenSchema } from '../lib/validation'
import { recordAudit } from '../lib/audit'
import { listNotificationsFor, markAllNotificationsRead } from '../lib/notifications'

const notifications = new Hono<{ Bindings: Bindings }>()

notifications.use('*', attachAuth, requireAuth())

notifications.get('/', async (c) => {
  return c.json(await listNotificationsFor(c.env.DB, c.get('auth')!))
})

notifications.post('/read-all', async (c) => {
  await markAllNotificationsRead(c.env.DB, c.get('auth')!)
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
