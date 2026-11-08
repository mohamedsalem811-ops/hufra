// Plan 8.2: partners. The admin panel manages them; the website and the app
// read the public list.
import { millimesToLyd, PARTNER_LOGO, partnerInputSchema, partnerOrderSchema, partnerPlaceSchema } from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import { invalidatePublicCaches } from '../lib/cache'
import { inspectLogo } from '../lib/image-check'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

type DB = Bindings['DB']

// Funded numbers come from the completed campaigns linked to the partner.
const PARTNER_SQL = `
  SELECT pt.*,
    (pt.visible = 1 AND (pt.starts_on IS NULL OR pt.starts_on <= date('now')) AND (pt.ends_on IS NULL OR pt.ends_on >= date('now'))) AS live,
    (SELECT COUNT(*) FROM campaigns c WHERE c.partner_id = pt.id AND c.status = 'completed') AS funded_count,
    COALESCE((SELECT SUM(COALESCE(c.final_cost_millimes, c.target_millimes)) FROM campaigns c WHERE c.partner_id = pt.id AND c.status = 'completed'), 0) AS funded_millimes
  FROM partners pt
  WHERE pt.deleted_at IS NULL`

type Row = Record<string, any>
const flag = (v: unknown) => v === 1 || v === true

function toAdmin(r: Row) {
  return {
    id: r.id,
    name_ar: r.name_ar,
    name_en: r.name_en,
    description_ar: r.description_ar,
    description_en: r.description_en,
    website: r.website,
    kind: r.kind,
    logo_key: r.logo_key ?? null,
    starts_on: r.starts_on ?? null,
    ends_on: r.ends_on ?? null,
    show_home: flag(r.show_home),
    show_about: flag(r.show_about),
    show_app: flag(r.show_app),
    show_campaigns: flag(r.show_campaigns),
    featured: flag(r.featured),
    visible: flag(r.visible),
    sort_order: r.sort_order,
    live: flag(r.live),
    funded_count: r.funded_count,
    funded_lyd: millimesToLyd(r.funded_millimes),
  }
}

function toPublic(r: Row) {
  const a = toAdmin(r)
  return {
    id: a.id,
    name_ar: a.name_ar,
    name_en: a.name_en,
    description_ar: a.description_ar,
    description_en: a.description_en,
    website: a.website,
    kind: a.kind,
    logo_key: a.logo_key,
    featured: a.featured,
    funded_count: a.funded_count,
    funded_lyd: a.funded_lyd,
  }
}

const getRow = (db: DB, id: number) => db.prepare(`${PARTNER_SQL} AND pt.id = ?`).bind(id).first<Row>()
const idParam = (raw: string | undefined) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
const bad = (c: any, status: 400 | 404 | 409 | 413, error: string, error_ar: string) => c.json({ error, error_ar }, status)

// ------------------------------------------------------------------ public

export const publicPartners = new Hono<{ Bindings: Bindings }>()

// GET /api/partners?place=home|about|app - featured first, then the team's order.
publicPartners.get('/', async (c) => {
  const place = partnerPlaceSchema.safeParse(c.req.query('place') ?? 'home')
  if (!place.success) return bad(c, 400, 'Invalid place', 'مكان غير صحيح')
  const column = { home: 'show_home', about: 'show_about', app: 'show_app' }[place.data]
  const rows = await c.env.DB.prepare(
    `SELECT * FROM (${PARTNER_SQL}) WHERE live = 1 AND ${column} = 1 ORDER BY featured DESC, sort_order ASC, id ASC LIMIT 50`
  ).all<Row>()
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ results: rows.results.map(toPublic) })
})

// ------------------------------------------------------------------- admin

export const adminPartners = new Hono<{ Bindings: Bindings }>()
adminPartners.use('*', attachAuth, requireRole('admin', 'super_admin'))

adminPartners.get('/partners', async (c) => {
  c.header('Cache-Control', 'private, no-store')
  const rows = await c.env.DB.prepare(`${PARTNER_SQL} ORDER BY pt.sort_order ASC, pt.id ASC`).all<Row>()
  return c.json({ results: rows.results.map(toAdmin) })
})

function values(p: ReturnType<typeof partnerInputSchema.parse>) {
  return [
    p.name_ar, p.name_en, p.description_ar, p.description_en, p.website, p.kind, p.starts_on, p.ends_on,
    p.show_home ? 1 : 0, p.show_about ? 1 : 0, p.show_app ? 1 : 0, p.show_campaigns ? 1 : 0, p.featured ? 1 : 0, p.visible ? 1 : 0,
  ]
}
const COLUMNS = 'name_ar, name_en, description_ar, description_en, website, kind, starts_on, ends_on, show_home, show_about, show_app, show_campaigns, featured, visible'

// One featured partner at a time: featuring one un-features the rest.
async function keepOneFeatured(db: DB, id: number, featured: boolean) {
  if (featured) await db.prepare('UPDATE partners SET featured = 0 WHERE id != ? AND featured = 1').bind(id).run()
}

adminPartners.post('/partners', async (c) => {
  const auth = c.get('auth')!
  const parsed = partnerInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, parsed.error.issues[0]?.message ?? 'Invalid input', 'بيانات غير صحيحة')
  const last = await c.env.DB.prepare('SELECT COALESCE(MAX(sort_order), 0) AS m FROM partners WHERE deleted_at IS NULL').first<{ m: number }>()
  const res = await c.env.DB.prepare(`INSERT INTO partners (${COLUMNS}, sort_order, created_by) VALUES (${'?, '.repeat(14)}?, ?)`)
    .bind(...values(parsed.data), (last?.m ?? 0) + 1, auth.userId)
    .run()
  const id = Number(res.meta.last_row_id)
  await keepOneFeatured(c.env.DB, id, parsed.data.featured)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'partner.create', entity: 'partners', entityId: id, after: parsed.data })
  await invalidatePublicCaches()
  return c.json({ partner: toAdmin((await getRow(c.env.DB, id))!) }, 201)
})

adminPartners.put('/partners/order', async (c) => {
  const auth = c.get('auth')!
  const parsed = partnerOrderSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, 'Invalid input', 'بيانات غير صحيحة')
  await c.env.DB.batch(
    parsed.data.ids.map((id, i) => c.env.DB.prepare('UPDATE partners SET sort_order = ? WHERE id = ? AND deleted_at IS NULL').bind(i + 1, id))
  )
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'partner.reorder', entity: 'partners', after: parsed.data })
  await invalidatePublicCaches()
  const rows = await c.env.DB.prepare(`${PARTNER_SQL} ORDER BY pt.sort_order ASC, pt.id ASC`).all<Row>()
  return c.json({ results: rows.results.map(toAdmin) })
})

adminPartners.put('/partners/:id', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const parsed = partnerInputSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, parsed.error.issues[0]?.message ?? 'Invalid input', 'بيانات غير صحيحة')
  const before = await getRow(c.env.DB, id)
  if (!before) return bad(c, 404, 'Not found', 'غير موجود')
  await c.env.DB.prepare(
    `UPDATE partners SET ${COLUMNS.split(', ').map((col) => `${col} = ?`).join(', ')}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  )
    .bind(...values(parsed.data), id)
    .run()
  await keepOneFeatured(c.env.DB, id, parsed.data.featured)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'partner.update', entity: 'partners', entityId: id, before: toAdmin(before), after: parsed.data })
  await invalidatePublicCaches()
  return c.json({ partner: toAdmin((await getRow(c.env.DB, id))!) })
})

// Soft delete: campaigns keep their link, but no longer show the partner.
adminPartners.delete('/partners/:id', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const before = await getRow(c.env.DB, id)
  if (!before) return bad(c, 404, 'Not found', 'غير موجود')
  await c.env.DB.prepare(`UPDATE partners SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), featured = 0 WHERE id = ?`).bind(id).run()
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'partner.delete', entity: 'partners', entityId: id, before: toAdmin(before) })
  await invalidatePublicCaches()
  return c.json({ ok: true })
})

// POST /api/admin/partners/:id/logo - PNG/WebP/JPEG re-drawn in the panel (never SVG).
adminPartners.post('/partners/:id/logo', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  if (Number(c.req.header('Content-Length') || 0) > PARTNER_LOGO.maxBytes + 64 * 1024) return bad(c, 413, 'Logo too large', 'الشعار كبير جداً')
  const before = await getRow(c.env.DB, id)
  if (!before) return bad(c, 404, 'Not found', 'غير موجود')
  const form = await c.req.formData().catch(() => null)
  const file = form?.get('logo')
  if (!file || typeof file === 'string') return bad(c, 400, 'Missing logo', 'الشعار مفقود')
  if (file.size > PARTNER_LOGO.maxBytes) return bad(c, 413, 'Logo too large', 'الشعار كبير جداً')
  const bytes = await file.arrayBuffer()
  const info = inspectLogo(bytes)
  if (!info) return bad(c, 400, 'Unsupported or damaged image (PNG, WebP or JPEG)', 'صورة غير مدعومة أو تالفة (PNG أو WebP أو JPEG)')
  const edge = Math.max(info.width, info.height)
  if (edge > PARTNER_LOGO.maxLongEdgePx) return bad(c, 413, 'Logo dimensions too large', 'أبعاد الشعار كبيرة جداً')
  if (edge < PARTNER_LOGO.minLongEdgePx) return bad(c, 400, 'Logo too small', 'الشعار صغير جداً')
  if (info.hasMetadata) return bad(c, 400, 'Image still contains metadata', 'الصورة تحتوي بيانات وصفية')

  const ext = info.type === 'image/png' ? 'png' : info.type === 'image/webp' ? 'webp' : 'jpg'
  const key = `photos/partners/${id}/${crypto.randomUUID()}.${ext}`
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: info.type, cacheControl: 'public, max-age=31536000, immutable' } })
  await c.env.DB.prepare(`UPDATE partners SET logo_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`).bind(key, id).run()
  if (before.logo_key) await c.env.PHOTOS.delete(before.logo_key).catch(() => undefined)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'partner.logo', entity: 'partners', entityId: id, after: { logo_key: key } })
  await invalidatePublicCaches()
  return c.json({ partner: toAdmin((await getRow(c.env.DB, id))!) }, 201)
})
