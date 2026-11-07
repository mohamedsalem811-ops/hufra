// Plan 8.2: the admin panel's report queue and report page.
import { millimesToLyd, reportQueueQuerySchema } from '@hufra/contracts'
import { Hono } from 'hono'

import { listCampaignRows, toCampaignSummary } from '../lib/donations'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

const adminReports = new Hono<{ Bindings: Bindings }>()
adminReports.use('*', attachAuth, requireRole('admin', 'super_admin'))

const noStore = (c: any) => c.header('Cache-Control', 'private, no-store')

// Open campaign first, else the latest one.
const CAMPAIGN_PICK = `(SELECT c.id FROM campaigns c WHERE c.pothole_id = p.id
  ORDER BY CASE WHEN c.status IN ('active','funded') THEN 0 ELSE 1 END, c.created_at DESC LIMIT 1)`

const SORTS = {
  newest: 'p.created_at DESC, p.id DESC',
  oldest: 'p.created_at ASC, p.id ASC',
  most_confirmed: 'p.upvotes_count DESC, p.created_at ASC',
} as const

// ---------------------------------------------------------------------------
// GET /api/admin/queue - search, filter, sort and page through reports
// ---------------------------------------------------------------------------
adminReports.get('/queue', async (c) => {
  const parsed = reportQueueQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid query', error_ar: 'معايير بحث غير صحيحة' }, 400)
  const { q, status, severity, region_id, duplicates, sort, page, page_size } = parsed.data

  const where = ['p.deleted_at IS NULL']
  const binds: unknown[] = []
  if (status) (where.push('p.status = ?'), binds.push(status))
  if (severity) (where.push('p.severity = ?'), binds.push(severity))
  if (region_id) (where.push('p.region_id = ?'), binds.push(region_id))
  if (duplicates) where.push(`EXISTS (SELECT 1 FROM duplicate_flags df WHERE df.review_status = 'pending' AND (df.pothole_id = p.id OR df.duplicate_of_id = p.id))`)
  if (q) {
    const number = /^#?\s*(\d{1,9})$/.exec(q)
    if (number) (where.push('p.id = ?'), binds.push(Number(number[1])))
    else {
      // Street names: a plain substring match (LIKE wildcards in the text are escaped).
      const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`
      where.push(`(p.street_ar LIKE ? ESCAPE '\\' OR p.street_en LIKE ? ESCAPE '\\' OR r.name_ar LIKE ? ESCAPE '\\' OR r.name_en LIKE ? ESCAPE '\\')`)
      binds.push(like, like, like, like)
    }
  }
  const whereSql = where.join(' AND ')

  const total = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM potholes p JOIN regions r ON r.id = p.region_id WHERE ${whereSql}`)
    .bind(...binds)
    .first<{ n: number }>()

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.status, p.severity, p.street_ar, p.street_en, p.region_id, r.name_ar AS region_name_ar, r.name_en AS region_name_en,
       p.upvotes_count, p.created_at,
       (SELECT ph.thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.deleted_at IS NULL ORDER BY ph.created_at ASC LIMIT 1) AS cover_thumb_key,
       (SELECT COUNT(*) FROM duplicate_flags df WHERE df.review_status = 'pending' AND (df.pothole_id = p.id OR df.duplicate_of_id = p.id)) AS duplicate_flag_count,
       cp.id AS campaign_id, cp.status AS campaign_status, cp.target_millimes AS campaign_target,
       CASE WHEN cp.id IS NULL THEN NULL ELSE
         COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = cp.id AND d.status = 'confirmed'), 0)
         + COALESCE((SELECT SUM(a.amount_millimes) FROM campaign_allocations a WHERE a.to_campaign_id = cp.id), 0)
       END AS campaign_raised
     FROM potholes p
     JOIN regions r ON r.id = p.region_id
     LEFT JOIN campaigns cp ON cp.id = ${CAMPAIGN_PICK}
     WHERE ${whereSql}
     ORDER BY ${SORTS[sort]}
     LIMIT ? OFFSET ?`
  )
    .bind(...binds, page_size, (page - 1) * page_size)
    .all<Record<string, any>>()

  noStore(c)
  return c.json({
    results: rows.results.map(({ campaign_id, campaign_status, campaign_target, campaign_raised, ...row }) => ({
      ...row,
      campaign: campaign_id
        ? { id: campaign_id, status: campaign_status, target_lyd: millimesToLyd(campaign_target), confirmed_lyd: millimesToLyd(campaign_raised) }
        : null,
    })),
    total: total?.n ?? 0,
    page,
    page_size,
  })
})

// ---------------------------------------------------------------------------
// GET /api/admin/reports/:id - the report page: details, reporter, photos,
// history with who changed it, possible duplicates and the campaign
// ---------------------------------------------------------------------------
adminReports.get('/reports/:id', async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)
  const db = c.env.DB

  const pothole = await db
    .prepare(
      `SELECT p.*, r.name_ar AS region_name_ar, r.name_en AS region_name_en, r.slug AS region_slug
       FROM potholes p JOIN regions r ON r.id = p.region_id WHERE p.id = ? AND p.deleted_at IS NULL`
    )
    .bind(id)
    .first<Record<string, any>>()
  if (!pothole) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  const [photos, history, reporter, duplicates, campaigns] = await Promise.all([
    db.prepare('SELECT id, thumb_key, r2_key, stage, created_at FROM pothole_photos WHERE pothole_id = ? AND deleted_at IS NULL ORDER BY created_at ASC').bind(id).all(),
    db
      .prepare(
        `SELECT h.from_status, h.to_status, h.note, h.at, COALESCE(u.display_name, u.email) AS actor_name
         FROM status_history h LEFT JOIN users u ON u.id = h.actor_id AND u.role IN ('admin','super_admin')
         WHERE h.pothole_id = ? ORDER BY h.at DESC, h.id DESC`
      )
      .bind(id)
      .all(),
    pothole.reporter_id
      ? db.prepare('SELECT id, code, display_name, email FROM users WHERE id = ? AND deleted_at IS NULL').bind(pothole.reporter_id).first()
      : Promise.resolve(null),
    db
      .prepare(
        `SELECT df.id AS flag_id, df.distance_m, (df.pothole_id = ?) AS this_is_newer,
           o.id AS other_id, o.status AS other_status, o.street_ar AS other_street_ar, o.street_en AS other_street_en, o.created_at AS other_created_at
         FROM duplicate_flags df
         JOIN potholes o ON o.id = CASE WHEN df.pothole_id = ? THEN df.duplicate_of_id ELSE df.pothole_id END AND o.deleted_at IS NULL
         WHERE df.review_status = 'pending' AND (df.pothole_id = ? OR df.duplicate_of_id = ?)
         ORDER BY df.distance_m ASC`
      )
      .bind(id, id, id, id)
      .all<Record<string, any>>(),
    listCampaignRows(db, `WHERE c.pothole_id = ? AND c.status IN ('active','funded')`, [id], 1).then(async (open) =>
      open.length ? open : listCampaignRows(db, 'WHERE c.pothole_id = ?', [id], 1)
    ),
  ])

  noStore(c)
  return c.json({
    pothole,
    photos: photos.results,
    history: history.results,
    reporter: reporter ?? null,
    duplicates: duplicates.results.map((d) => ({ ...d, this_is_newer: !!d.this_is_newer })),
    campaign: campaigns[0] ? toCampaignSummary(campaigns[0]) : null,
  })
})

export default adminReports
