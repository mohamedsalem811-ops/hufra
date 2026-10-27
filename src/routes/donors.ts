// Manual donor ledger. HUFRA does not process real payments - donations
// happen off-platform and an admin records them here (name + amount in LYD)
// so the current top donor can be shown on the homepage. See
// migrations/0005_donors.sql for the schema/assumption note.
import { Hono } from 'hono'
import type { Bindings, DonorRow } from '../lib/types'
import { donorSchema } from '../lib/validation'
import { attachAuth, requireRole } from '../middleware/auth'
import { recordAudit } from '../lib/audit'

const donors = new Hono<{ Bindings: Bindings }>()

// ---------------------------------------------------------------------------
// GET /api/donors/top - public. Returns the single highest-amount donor
// (or null if none recorded yet) for the homepage highlight.
// ---------------------------------------------------------------------------
donors.get('/top', async (c) => {
  const top = await c.env.DB.prepare(
    `SELECT id, name, amount_lyd, note FROM donors WHERE deleted_at IS NULL ORDER BY amount_lyd DESC, created_at ASC LIMIT 1`
  ).first<Pick<DonorRow, 'id' | 'name' | 'amount_lyd' | 'note'>>()
  return c.json({ donor: top ?? null })
})

// ---------------------------------------------------------------------------
// GET /api/donors - admin only. Full list for management.
// ---------------------------------------------------------------------------
donors.get('/', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM donors WHERE deleted_at IS NULL ORDER BY amount_lyd DESC, created_at ASC`
  ).all()
  return c.json({ results: rows.results })
})

// ---------------------------------------------------------------------------
// POST /api/donors - admin only. Record a new donor entry.
// ---------------------------------------------------------------------------
donors.post('/', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = donorSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  const d = parsed.data

  const result = await c.env.DB.prepare(
    `INSERT INTO donors (name, amount_lyd, note, created_by) VALUES (?, ?, ?, ?)`
  )
    .bind(d.name, d.amount_lyd, d.note ?? null, authCtx.userId)
    .run()

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'donor.create', entity: 'donors', entityId: result.meta.last_row_id as number, after: d })
  return c.json({ id: result.meta.last_row_id }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /api/donors/:id - admin only. Edit a donor entry.
// ---------------------------------------------------------------------------
donors.patch('/:id', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = donorSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  const d = parsed.data

  const existing = await c.env.DB.prepare('SELECT * FROM donors WHERE id = ? AND deleted_at IS NULL').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(
    `UPDATE donors SET name = COALESCE(?, name), amount_lyd = COALESCE(?, amount_lyd), note = COALESCE(?, note) WHERE id = ?`
  )
    .bind(d.name ?? null, d.amount_lyd ?? null, d.note ?? null, id)
    .run()

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'donor.update', entity: 'donors', entityId: id, before: existing, after: d })
  return c.json({ ok: true })
})

// ---------------------------------------------------------------------------
// DELETE /api/donors/:id - admin only. Soft-delete a donor entry.
// ---------------------------------------------------------------------------
donors.delete('/:id', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const id = Number(c.req.param('id'))

  const existing = await c.env.DB.prepare('SELECT * FROM donors WHERE id = ? AND deleted_at IS NULL').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(`UPDATE donors SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(id).run()

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'donor.delete', entity: 'donors', entityId: id, before: existing })
  return c.json({ ok: true })
})

export default donors
