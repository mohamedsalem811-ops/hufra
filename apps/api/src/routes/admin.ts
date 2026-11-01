import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'
import { recordAudit } from '../lib/audit'
import { invalidatePublicCaches } from '../lib/cache'
import { purgeReportPhotos } from '../lib/storage'
import { duplicateReviewSchema, promoteAdminSchema, demoteAdminSchema } from '@hufra/contracts'
import { listNotificationsFor, markAllNotificationsRead } from '../lib/notifications'

const admin = new Hono<{ Bindings: Bindings }>()

admin.use('*', attachAuth, requireRole('admin', 'super_admin'))

// ---------------------------------------------------------------------------
// Notifications bell/badge
// ---------------------------------------------------------------------------
// Same data as GET /api/notifications (kept for the admin page).
admin.get('/notifications', async (c) => {
  return c.json(await listNotificationsFor(c.env.DB, c.get('auth')!))
})

admin.post('/notifications/read-all', async (c) => {
  await markAllNotificationsRead(c.env.DB, c.get('auth')!)
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// Duplicate flags review
// ---------------------------------------------------------------------------
admin.get('/duplicates', async (c) => {
  // Only flags that still need a decision: both reports must still exist.
  const rows = await c.env.DB.prepare(
    `SELECT df.*, p1.lat as pothole_lat, p1.lng as pothole_lng, p1.status as pothole_status,
            p2.lat as duplicate_lat, p2.lng as duplicate_lng, p2.status as duplicate_status
     FROM duplicate_flags df
     JOIN potholes p1 ON p1.id = df.pothole_id AND p1.deleted_at IS NULL
     JOIN potholes p2 ON p2.id = df.duplicate_of_id AND p2.deleted_at IS NULL
     WHERE df.review_status = 'pending'
     ORDER BY df.created_at DESC`
  ).all()
  return c.json({ results: rows.results })
})


// Review a duplicate flag once. "confirmed" removes the newer report
// (pothole_id) as a duplicate of the older one; "rejected" keeps both.
admin.patch('/duplicates/:id', async (c) => {
  const authCtx = c.get('auth')!
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)
  const body = await c.req.json().catch(() => null)
  const parsed = duplicateReviewSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  const { decision } = parsed.data

  const flag = await c.env.DB.prepare(
    `SELECT df.id, df.pothole_id, df.duplicate_of_id, df.review_status,
            p1.deleted_at AS dup_deleted, p2.deleted_at AS original_deleted
     FROM duplicate_flags df
     JOIN potholes p1 ON p1.id = df.pothole_id
     JOIN potholes p2 ON p2.id = df.duplicate_of_id
     WHERE df.id = ?`
  )
    .bind(id)
    .first<{ id: number; pothole_id: number; duplicate_of_id: number; review_status: string; dup_deleted: string | null; original_deleted: string | null }>()
  if (!flag) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)
  if (flag.review_status !== 'pending') {
    return c.json({ error: `Already reviewed (${flag.review_status})`, error_ar: 'تمت مراجعة هذا التنبيه مسبقاً' }, 409)
  }
  if (flag.dup_deleted || flag.original_deleted) {
    return c.json({ error: 'One of these reports was already deleted', error_ar: 'أحد هذين البلاغين محذوف بالفعل' }, 409)
  }

  const db = c.env.DB
  const statements = [
    // Conditional on still being pending, so two admins cannot both apply it.
    db.prepare(
      `UPDATE duplicate_flags SET review_status = ?, reviewed_by = ?, reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? AND review_status = 'pending'`
    ).bind(decision, authCtx.userId, id),
  ]
  if (decision === 'confirmed') {
    statements.push(
      db.prepare(
        `UPDATE potholes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
         WHERE id = ? AND deleted_at IS NULL
           AND EXISTS (SELECT 1 FROM duplicate_flags WHERE id = ? AND reviewed_by = ? AND review_status = 'confirmed')`
      ).bind(flag.pothole_id, id, authCtx.userId)
    )
  }
  const [marked] = await db.batch(statements)
  if (!marked.meta.changes) {
    return c.json({ error: 'Already reviewed', error_ar: 'تمت مراجعة هذا التنبيه مسبقاً' }, 409)
  }

  if (decision === 'confirmed') {
    await purgeReportPhotos(db, c.env.PHOTOS, flag.pothole_id)
    await invalidatePublicCaches()
  }
  await recordAudit(db, {
    actorId: authCtx.userId,
    action: 'duplicate.review',
    entity: 'duplicate_flags',
    entityId: id,
    before: { review_status: 'pending', pothole_id: flag.pothole_id, duplicate_of_id: flag.duplicate_of_id },
    after: { decision },
  })
  return c.json({ ok: true, decision, deleted_report_id: decision === 'confirmed' ? flag.pothole_id : null })
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


admin.post('/admins/promote', requireRole('super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = promoteAdminSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)

  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL').bind(parsed.data.email).first<{ id: number; role: string }>()
  if (!user) return c.json({ error: 'User not found', error_ar: 'المستخدم غير موجود' }, 404)

  await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(parsed.data.role, user.id).run()
  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'user.promote', entity: 'users', entityId: user.id, before: { role: user.role }, after: { role: parsed.data.role } })
  return c.json({ ok: true })
})


// Remove admin rights (account becomes a normal user). Guard rails: you cannot
// demote yourself and the last remaining super_admin can never be demoted.
admin.post('/admins/demote', requireRole('super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = demoteAdminSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)

  const user = await c.env.DB.prepare('SELECT id, role FROM users WHERE email = ? AND deleted_at IS NULL')
    .bind(parsed.data.email)
    .first<{ id: number; role: string }>()
  if (!user) return c.json({ error: 'User not found', error_ar: 'المستخدم غير موجود' }, 404)
  if (user.role === 'user') return c.json({ error: 'Account is not an admin', error_ar: 'الحساب ليس مشرفاً' }, 400)
  if (user.id === authCtx.userId) {
    return c.json({ error: 'You cannot remove your own admin rights', error_ar: 'لا يمكنك إزالة صلاحياتك بنفسك' }, 400)
  }
  if (user.role === 'super_admin') {
    const remaining = await c.env.DB.prepare(
      `SELECT COUNT(*) as n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND id != ?`
    )
      .bind(user.id)
      .first<{ n: number }>()
    if ((remaining?.n ?? 0) < 1) {
      return c.json({ error: 'Cannot remove the last super admin', error_ar: 'لا يمكن إزالة آخر مسؤول عام' }, 400)
    }
  }

  await c.env.DB.prepare(`UPDATE users SET role = 'user' WHERE id = ?`).bind(user.id).run()
  await c.env.DB.prepare(
    `UPDATE refresh_tokens SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE user_id = ? AND revoked_at IS NULL`
  )
    .bind(user.id)
    .run()
  await recordAudit(c.env.DB, {
    actorId: authCtx.userId,
    action: 'user.demote',
    entity: 'users',
    entityId: user.id,
    before: { role: user.role },
    after: { role: 'user' },
  })
  return c.json({ ok: true })
})

export default admin
