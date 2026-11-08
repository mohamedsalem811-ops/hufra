// Admin panel, plan 8.2e: admin accounts (super admin only), regions with
// their workload, and the donor ranking.
import { demoteAdminSchema, promoteAdminSchema, updateAdminSchema } from '@hufra/contracts'
import { Hono, type Context } from 'hono'

import { recordAudit } from '../lib/audit'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

const people = new Hono<{ Bindings: Bindings }>()

people.use('/admins', attachAuth, requireRole('super_admin'))
people.use('/admins/*', attachAuth, requireRole('super_admin'))
people.use('/regions', attachAuth, requireRole('admin', 'super_admin'))
people.use('/top-donors', attachAuth, requireRole('admin', 'super_admin'))

type Ctx = Context<{ Bindings: Bindings }>
type Role = 'user' | 'admin' | 'super_admin'
type Target = { id: number; email: string; role: Role; suspended_at: string | null }

const NOW = `strftime('%Y-%m-%dT%H:%M:%fZ','now')`
const invalid = (c: Ctx) => c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
const refuse = (c: Ctx, error: string, error_ar: string, status: 400 | 404 | 409 = 400) => c.json({ error, error_ar }, status)

// ---------------------------------------------------------------- admins

async function loadAdmins(db: D1Database, onlyId?: number) {
  const rows = await db
    .prepare(
      `SELECT id, email, display_name, role, code, totp_enabled, created_at, last_login_at, suspended_at
       FROM users WHERE role IN ('admin','super_admin') AND deleted_at IS NULL ${onlyId ? 'AND id = ?' : ''}
       ORDER BY role = 'super_admin' DESC, suspended_at IS NOT NULL, created_at ASC`
    )
    .bind(...(onlyId ? [onlyId] : []))
    .all<Record<string, any>>()
  const regions = await db
    .prepare(
      `SELECT ar.user_id, r.id, r.name_ar, r.name_en FROM admin_regions ar JOIN regions r ON r.id = ar.region_id
       ${onlyId ? 'WHERE ar.user_id = ?' : ''} ORDER BY r.name_ar`
    )
    .bind(...(onlyId ? [onlyId] : []))
    .all<{ user_id: number; id: number; name_ar: string; name_en: string }>()
  return rows.results.map((u) => ({
    id: u.id,
    email: u.email,
    display_name: u.display_name,
    role: u.role,
    code: u.code,
    totp_enabled: u.totp_enabled === 1,
    created_at: u.created_at,
    last_login_at: u.last_login_at,
    suspended: !!u.suspended_at,
    regions: u.role === 'super_admin' ? [] : regions.results.filter((r) => r.user_id === u.id).map(({ user_id: _, ...r }) => r),
  }))
}

/**
 * Refuses changes that would lock everyone out: nobody changes or suspends
 * their own account, and at least one active super admin always remains.
 */
async function guard(c: Ctx, target: Target, next: { role: Role; suspended: boolean }) {
  const auth = c.get('auth')!
  const changes = next.role !== target.role || next.suspended !== !!target.suspended_at
  if (target.id === auth.userId && changes) {
    return refuse(c, 'You cannot change your own admin account', 'لا يمكنك تغيير صلاحيات حسابك بنفسك')
  }
  const losesSuper = target.role === 'super_admin' && !target.suspended_at && (next.role !== 'super_admin' || next.suspended)
  if (losesSuper) {
    const others = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND deleted_at IS NULL AND suspended_at IS NULL AND id != ?`
    )
      .bind(target.id)
      .first<{ n: number }>()
    if ((others?.n ?? 0) < 1) return refuse(c, 'Cannot remove the last super admin', 'لا يمكن إزالة آخر مشرف عام')
  }
  return null
}

async function checkRegions(db: D1Database, ids: number[]) {
  const unique = [...new Set(ids)]
  if (!unique.length) return unique
  const found = await db
    .prepare(`SELECT COUNT(*) AS n FROM regions WHERE id IN (${unique.map(() => '?').join(',')})`)
    .bind(...unique)
    .first<{ n: number }>()
  return found?.n === unique.length ? unique : null
}

function setRegions(db: D1Database, userId: number, ids: number[]) {
  return [
    db.prepare('DELETE FROM admin_regions WHERE user_id = ?').bind(userId),
    ...ids.map((r) => db.prepare('INSERT INTO admin_regions (user_id, region_id) VALUES (?, ?)').bind(userId, r)),
  ]
}

/** Ends every session of an account: refresh tokens, and access tokens issued until now. */
const revokeSessions = (db: D1Database, userId: number) => [
  db.prepare(`UPDATE refresh_tokens SET revoked_at = ${NOW} WHERE user_id = ? AND revoked_at IS NULL`).bind(userId),
  db.prepare(`UPDATE users SET sessions_revoked_at = ${NOW} WHERE id = ?`).bind(userId),
]

const regionIdsOf = async (db: D1Database, userId: number) =>
  (await db.prepare('SELECT region_id FROM admin_regions WHERE user_id = ? ORDER BY region_id').bind(userId).all<{ region_id: number }>()).results.map(
    (r) => r.region_id
  )

people.get('/admins', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  return c.json({ results: await loadAdmins(c.env.DB) })
})

// Make an existing account an admin (or change an admin's role and regions).
people.post('/admins/promote', async (c) => {
  const parsed = promoteAdminSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const { email, role } = parsed.data
  const db = c.env.DB
  const user = await db.prepare('SELECT id, email, role, suspended_at FROM users WHERE email = ? AND deleted_at IS NULL').bind(email).first<Target>()
  if (!user) return refuse(c, 'User not found', 'لا يوجد حساب بهذا البريد. اطلب من الشخص إنشاء حساب في التطبيق أولاً.', 404)
  const blocked = await guard(c, user, { role, suspended: !!user.suspended_at })
  if (blocked) return blocked
  const regionIds = await checkRegions(db, role === 'admin' ? parsed.data.region_ids : [])
  if (!regionIds) return refuse(c, 'Unknown region', 'منطقة غير معروفة')

  const before = { role: user.role, region_ids: await regionIdsOf(db, user.id) }
  await db.batch([db.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, user.id), ...setRegions(db, user.id, regionIds)])
  await recordAudit(db, { actorId: c.get('auth')!.userId, action: 'user.promote', entity: 'users', entityId: user.id, before, after: { role, region_ids: regionIds } })
  const [admin] = await loadAdmins(db, user.id)
  return c.json({ ok: true, admin })
})

// Remove admin rights (the account becomes a normal user).
people.post('/admins/demote', async (c) => {
  const parsed = demoteAdminSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const db = c.env.DB
  const user = await db.prepare('SELECT id, email, role, suspended_at FROM users WHERE email = ? AND deleted_at IS NULL').bind(parsed.data.email).first<Target>()
  if (!user) return refuse(c, 'User not found', 'المستخدم غير موجود', 404)
  if (user.role === 'user') return refuse(c, 'Account is not an admin', 'الحساب ليس مشرفاً')
  if (user.id === c.get('auth')!.userId) return refuse(c, 'You cannot remove your own admin rights', 'لا يمكنك إزالة صلاحياتك بنفسك')
  const blocked = await guard(c, user, { role: 'user', suspended: false })
  if (blocked) return blocked

  // Back to an ordinary citizen account: no regions, no suspension.
  await db.batch([
    db.prepare(`UPDATE users SET role = 'user', suspended_at = NULL WHERE id = ?`).bind(user.id),
    ...setRegions(db, user.id, []),
    ...revokeSessions(db, user.id),
  ])
  await recordAudit(db, { actorId: c.get('auth')!.userId, action: 'user.demote', entity: 'users', entityId: user.id, before: { role: user.role }, after: { role: 'user' } })
  return c.json({ ok: true })
})

// Change an admin's role, regions or suspension.
people.put('/admins/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return invalid(c)
  const parsed = updateAdminSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return invalid(c)
  const db = c.env.DB
  const user = await db
    .prepare(`SELECT id, email, role, suspended_at FROM users WHERE id = ? AND role IN ('admin','super_admin') AND deleted_at IS NULL`)
    .bind(id)
    .first<Target>()
  if (!user) return refuse(c, 'Admin not found', 'المشرف غير موجود', 404)
  const role = parsed.data.role ?? user.role
  const suspended = parsed.data.suspended ?? !!user.suspended_at
  const blocked = await guard(c, user, { role, suspended })
  if (blocked) return blocked

  const beforeRegions = await regionIdsOf(db, id)
  const wanted = role === 'super_admin' ? [] : (parsed.data.region_ids ?? beforeRegions)
  const regionIds = await checkRegions(db, wanted)
  if (!regionIds) return refuse(c, 'Unknown region', 'منطقة غير معروفة')

  const suspending = suspended && !user.suspended_at
  await db.batch([
    db.prepare(`UPDATE users SET role = ?, suspended_at = ${suspended ? `COALESCE(suspended_at, ${NOW})` : 'NULL'} WHERE id = ?`).bind(role, id),
    ...setRegions(db, id, regionIds),
    // A suspended account, or one whose role changed, signs in again.
    ...(suspending || role !== user.role ? revokeSessions(db, id) : []),
  ])
  await recordAudit(db, {
    actorId: c.get('auth')!.userId,
    action: suspending ? 'user.suspend' : !suspended && user.suspended_at ? 'user.reinstate' : 'user.update',
    entity: 'users',
    entityId: id,
    before: { role: user.role, suspended: !!user.suspended_at, region_ids: beforeRegions },
    after: { role, suspended, region_ids: regionIds },
  })
  const [admin] = await loadAdmins(db, id)
  return c.json({ admin })
})

// ---------------------------------------------------------------- regions

// Every region, inactive ones too, with how much work is waiting there.
people.get('/regions', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT r.*,
       (SELECT COUNT(*) FROM potholes p WHERE p.region_id = r.id AND p.deleted_at IS NULL AND p.status != 'fixed') AS open_reports,
       (SELECT COUNT(*) FROM potholes p WHERE p.region_id = r.id AND p.deleted_at IS NULL) AS total_reports,
       (SELECT COUNT(*) FROM admin_regions ar JOIN users u ON u.id = ar.user_id
          WHERE ar.region_id = r.id AND u.role = 'admin' AND u.deleted_at IS NULL AND u.suspended_at IS NULL) AS admin_count
     FROM regions r ORDER BY r.active DESC, r.name_ar ASC`
  ).all()
  c.header('Cache-Control', 'private, no-store')
  return c.json({ results: rows.results })
})

// ---------------------------------------------------------------- donors

// Largest donors: confirmed transfers per person, plus cash gifts the team
// recorded by hand. Names only where the donor chose to show theirs.
people.get('/top-donors', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT name, cash, amount_millimes, donations FROM (
       SELECT CASE WHEN MAX(d.show_name) = 1 THEN COALESCE(NULLIF(TRIM(u.display_name), ''), u.code) END AS name,
              0 AS cash, SUM(d.amount_millimes) AS amount_millimes, COUNT(*) AS donations, MIN(d.created_at) AS since
       FROM donations d JOIN users u ON u.id = d.user_id
       WHERE d.status = 'confirmed'
       GROUP BY d.user_id
       UNION ALL
       SELECT name, 1, CAST(ROUND(amount_lyd * 1000) AS INTEGER), 1, created_at
       FROM donors WHERE deleted_at IS NULL
     ) ORDER BY amount_millimes DESC, since ASC LIMIT 10`
  ).all<{ name: string | null; cash: number; amount_millimes: number; donations: number }>()
  c.header('Cache-Control', 'private, no-store')
  return c.json({ results: rows.results.map((r) => ({ ...r, cash: r.cash === 1 })) })
})

export default people
