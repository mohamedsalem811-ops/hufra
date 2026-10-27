import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'
import { recordAudit } from '../lib/audit'
import { z } from 'zod'

const admin = new Hono<{ Bindings: Bindings }>()

admin.use('*', attachAuth, requireRole('admin', 'super_admin'))

// ---------------------------------------------------------------------------
// Notifications bell/badge
// ---------------------------------------------------------------------------
admin.get('/notifications', async (c) => {
  const authCtx = c.get('auth')!
  const rows = await c.env.DB.prepare(
    `SELECT * FROM notifications
     WHERE (target_role = ? OR target_user_id = ?)
     ORDER BY created_at DESC LIMIT 50`
  )
    .bind(authCtx.role, authCtx.userId)
    .all()

  const unread = await c.env.DB.prepare(
    `SELECT COUNT(*) as n FROM notifications
     WHERE (target_role = ? OR target_user_id = ?) AND read_at IS NULL`
  )
    .bind(authCtx.role, authCtx.userId)
    .first<{ n: number }>()

  return c.json({ results: rows.results, unread_count: unread?.n ?? 0 })
})

admin.post('/notifications/read-all', async (c) => {
  const authCtx = c.get('auth')!
  await c.env.DB.prepare(
    `UPDATE notifications SET read_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE (target_role = ? OR target_user_id = ?) AND read_at IS NULL`
  )
    .bind(authCtx.role, authCtx.userId)
    .run()
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Duplicate flags review
// ---------------------------------------------------------------------------
admin.get('/duplicates', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT df.*, p1.lat as pothole_lat, p1.lng as pothole_lng, p1.status as pothole_status,
            p2.lat as duplicate_lat, p2.lng as duplicate_lng, p2.status as duplicate_status
     FROM duplicate_flags df
     JOIN potholes p1 ON p1.id = df.pothole_id
     JOIN potholes p2 ON p2.id = df.duplicate_of_id
     WHERE df.review_status = 'pending'
     ORDER BY df.created_at DESC`
  ).all()
  return c.json({ results: rows.results })
})

const reviewSchema = z.object({ decision: z.enum(['confirmed', 'rejected']) })

admin.patch('/duplicates/:id', async (c) => {
  const authCtx = c.get('auth')!
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)

  await c.env.DB.prepare(
    `UPDATE duplicate_flags SET review_status = ?, reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  )
    .bind(parsed.data.decision, authCtx.userId, id)
    .run()

  if (parsed.data.decision === 'confirmed') {
    const flag = await c.env.DB.prepare('SELECT pothole_id FROM duplicate_flags WHERE id = ?').bind(id).first<{ pothole_id: number }>()
    if (flag) {
      await c.env.DB.prepare(`UPDATE potholes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
        .bind(flag.pothole_id)
        .run()
      await Promise.allSettled([
        c.env.KV.delete('counters:v1'),
        c.env.KV.delete('top_reporter:v1'),
      ])
    }
  }

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'duplicate.review', entity: 'duplicate_flags', entityId: id, after: parsed.data })
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------
admin.get('/analytics', async (c) => {
  const byStatus = await c.env.DB.prepare(
    `SELECT status, COUNT(*) as n FROM potholes WHERE deleted_at IS NULL GROUP BY status`
  ).all()
  const byRegion = await c.env.DB.prepare(
    `SELECT r.name_ar, r.name_en, COUNT(p.id) as n
     FROM regions r LEFT JOIN potholes p ON p.region_id = r.id AND p.deleted_at IS NULL
     GROUP BY r.id ORDER BY n DESC`
  ).all()
  const bySeverity = await c.env.DB.prepare(
    `SELECT severity, COUNT(*) as n FROM potholes WHERE deleted_at IS NULL GROUP BY severity`
  ).all()
  const byMonth = await c.env.DB.prepare(
    `SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as n
     FROM potholes WHERE deleted_at IS NULL GROUP BY month ORDER BY month DESC LIMIT 12`
  ).all()

  return c.json({
    by_status: byStatus.results,
    by_region: byRegion.results,
    by_severity: bySeverity.results,
    by_month: byMonth.results,
  })
})

// ---------------------------------------------------------------------------
// Reports queue (pending review)
// ---------------------------------------------------------------------------
admin.get('/reports', async (c) => {
  const status = c.req.query('status')
  const conditions = ['p.deleted_at IS NULL']
  const params: unknown[] = []
  if (status) {
    conditions.push('p.status = ?')
    params.push(status)
  }
  const rows = await c.env.DB.prepare(
    `SELECT p.*, r.name_ar as region_name_ar, r.name_en as region_name_en,
       (SELECT COUNT(*) FROM duplicate_flags df WHERE df.pothole_id = p.id AND df.review_status = 'pending') as duplicate_flag_count
     FROM potholes p JOIN regions r ON r.id = p.region_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY p.created_at DESC LIMIT 200`
  )
    .bind(...params)
    .all()
  return c.json({ results: rows.results })
})

// ---------------------------------------------------------------------------
// Audit log viewer (super_admin only)
// ---------------------------------------------------------------------------
admin.get('/audit-logs', requireRole('super_admin'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT al.*, u.email as actor_email, u.code as actor_code
     FROM audit_logs al LEFT JOIN users u ON u.id = al.actor_id
     ORDER BY al.created_at DESC LIMIT 200`
  ).all()
  return c.json({ results: rows.results })
})

// ---------------------------------------------------------------------------
// Manage admins (super_admin only)
// ---------------------------------------------------------------------------
admin.get('/admins', requireRole('super_admin'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT id, email, role, code, totp_enabled, created_at FROM users WHERE role IN ('admin','super_admin') AND deleted_at IS NULL ORDER BY created_at DESC`
  ).all()
  return c.json({ results: rows.results })
})

const promoteSchema = z.object({ email: z.string().email(), role: z.enum(['admin', 'super_admin']) })

admin.post('/admins/promote', requireRole('super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = promoteSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)

  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL').bind(parsed.data.email).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: 'User not found', error_ar: 'المستخدم غير موجود' }, 404)

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(parsed.data.role, user.id).run()
  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'user.promote', entity: 'users', entityId: user.id, before: { role: user.role }, after: { role: parsed.data.role } })
  return c.json({ ok: true })
})

export default admin
