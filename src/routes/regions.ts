import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { regionSchema } from '../lib/validation'
import { attachAuth, requireRole } from '../middleware/auth'
import { recordAudit } from '../lib/audit'

const regions = new Hono<{ Bindings: Bindings }>()

regions.get('/', async (c) => {
  const activeOnly = c.req.query('all') !== '1'
  const sql = activeOnly
    ? 'SELECT * FROM regions WHERE active = 1 ORDER BY name_ar ASC'
    : 'SELECT * FROM regions ORDER BY name_ar ASC'
  const rows = await c.env.DB.prepare(sql).all()
  return c.json({ results: rows.results })
})

regions.post('/', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = regionSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  const d = parsed.data

  const existing = await c.env.DB.prepare('SELECT id FROM regions WHERE slug = ?').bind(d.slug).first()
  if (existing) return c.json({ error: 'Region slug already exists', error_ar: 'المنطقة موجودة من قبل' }, 409)

  const result = await c.env.DB.prepare(
    `INSERT INTO regions (slug, name_ar, name_en, center_lat, center_lng, active) VALUES (?, ?, ?, ?, ?, ?)`
  )
    .bind(d.slug, d.name_ar, d.name_en, d.center_lat, d.center_lng, d.active ? 1 : 0)
    .run()

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'region.create', entity: 'regions', entityId: result.meta.last_row_id as number, after: d })
  return c.json({ id: result.meta.last_row_id }, 201)
})

regions.patch('/:id', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const authCtx = c.get('auth')!
  const id = Number(c.req.param('id'))
  const body = await c.req.json().catch(() => null)
  const parsed = regionSchema.partial().safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)
  const d = parsed.data

  const existing = await c.env.DB.prepare('SELECT * FROM regions WHERE id = ?').bind(id).first()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(
    `UPDATE regions SET name_ar = COALESCE(?, name_ar), name_en = COALESCE(?, name_en),
       center_lat = COALESCE(?, center_lat), center_lng = COALESCE(?, center_lng),
       active = COALESCE(?, active) WHERE id = ?`
  )
    .bind(d.name_ar ?? null, d.name_en ?? null, d.center_lat ?? null, d.center_lng ?? null, d.active === undefined ? null : d.active ? 1 : 0, id)
    .run()

  await recordAudit(c.env.DB, { actorId: authCtx.userId, action: 'region.update', entity: 'regions', entityId: id, before: existing, after: d })
  return c.json({ ok: true })
})

export default regions
