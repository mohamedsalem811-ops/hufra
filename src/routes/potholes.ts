import { Hono } from 'hono'
import type { Bindings, PotholeRow } from '../lib/types'
import { createPotholeSchema, updateStatusSchema, listQuerySchema } from '../lib/validation'
import {
  boundingBoxForRadius,
  haversineDistanceMeters,
  isPlausibleLibyaCoordinate,
  nearestRegion,
  DUPLICATE_RADIUS_METERS,
} from '../lib/geo'
import { checkRateLimit, REPORT_LIMIT_PER_IP, REPORT_LIMIT_PER_USER, REPORT_LIMIT_WINDOW_SECONDS } from '../lib/rate-limit'
import { recordAudit, hashIp } from '../lib/audit'
import { notifyAdmins, notifyUser } from '../lib/notifications'
import { attachAuth, requireRole } from '../middleware/auth'
import { invalidatePublicCaches } from '../lib/cache'
import { createUploadToken } from '../lib/upload-token'
import { purgeReportPhotos } from '../lib/storage'

const potholes = new Hono<{ Bindings: Bindings }>()

function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
}

// Columns that identify or contact the person who filed a report. They are
// never part of a public response: reporter_contact is the optional phone
// number from the report form, reporter_id links a report to an account, and
// client_report_uuid is the reporting device's offline-sync id. Only admins
// (who may need to call the reporter) receive them.
const PRIVATE_REPORT_FIELDS = ['reporter_contact', 'reporter_id', 'client_report_uuid'] as const

function isAdmin(c: any): boolean {
  const role = c.get('auth')?.role
  return role === 'admin' || role === 'super_admin'
}

export function toPublicReport<T extends object>(row: T): Omit<T, (typeof PRIVATE_REPORT_FIELDS)[number]> {
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) }
  for (const field of PRIVATE_REPORT_FIELDS) delete copy[field]
  return copy as Omit<T, (typeof PRIVATE_REPORT_FIELDS)[number]>
}


// ---------------------------------------------------------------------------
// GET /api/potholes - list with filters (status, region, severity, bbox, near)
// Public. Row-level rule: soft-deleted rows are always excluded.
// ---------------------------------------------------------------------------
potholes.get('/', attachAuth, async (c) => {
  const query = c.req.query()
  const parsed = listQuerySchema.safeParse(query)
  if (!parsed.success) {
    return c.json({ error: 'Invalid query', error_ar: 'معايير بحث غير صحيحة' }, 400)
  }
  const { status, region_id, severity, bbox, near_lat, near_lng, radius_m, limit, offset } = parsed.data

  const conditions: string[] = ['p.deleted_at IS NULL']
  const params: unknown[] = []

  if (status) {
    conditions.push('p.status = ?')
    params.push(status)
  }
  if (region_id) {
    conditions.push('p.region_id = ?')
    params.push(region_id)
  }
  if (severity) {
    conditions.push('p.severity = ?')
    params.push(severity)
  }
  if (bbox) {
    const parts = bbox.split(',').map(Number)
    if (parts.length === 4 && parts.every((n) => Number.isFinite(n))) {
      const [minLat, minLng, maxLat, maxLng] = parts
      conditions.push('p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?')
      params.push(Math.min(minLat, maxLat), Math.max(minLat, maxLat), Math.min(minLng, maxLng), Math.max(minLng, maxLng))
    }
  }

  let nearBox: ReturnType<typeof boundingBoxForRadius> | null = null
  if (near_lat !== undefined && near_lng !== undefined) {
    const radius = radius_m ?? 2000
    nearBox = boundingBoxForRadius({ lat: near_lat, lng: near_lng }, radius)
    conditions.push('p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?')
    params.push(nearBox.minLat, nearBox.maxLat, nearBox.minLng, nearBox.maxLng)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  const sql = `
    SELECT p.*, r.name_ar as region_name_ar, r.name_en as region_name_en,
      (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.deleted_at IS NULL ORDER BY ph.created_at ASC LIMIT 1) as cover_thumb_key
    FROM potholes p
    JOIN regions r ON r.id = p.region_id
    ${where}
    ORDER BY p.created_at DESC
    LIMIT ? OFFSET ?
  `
  const rows = await c.env.DB.prepare(sql).bind(...params, limit, offset).all()

  let results = (rows.results as any[]).map((row) => (isAdmin(c) ? row : toPublicReport(row)))

  if (near_lat !== undefined && near_lng !== undefined) {
    const radius = radius_m ?? 2000
    results = results
      .map((row) => ({ ...row, distance_m: haversineDistanceMeters({ lat: near_lat, lng: near_lng }, { lat: row.lat, lng: row.lng }) }))
      .filter((row) => row.distance_m <= radius)
      .sort((a, b) => a.distance_m - b.distance_m)
  }

  if (isAdmin(c)) c.header('Cache-Control', 'private, no-store')
  return c.json({ results, limit, offset })
})

// ---------------------------------------------------------------------------
// GET /api/potholes/counters - live homepage counters (public, cached briefly)
// ---------------------------------------------------------------------------
potholes.get('/counters', async (c) => {
  const cacheKey = 'counters:v1'
  const cached = await c.env.KV.get(cacheKey)
  if (cached) return c.json(JSON.parse(cached))

  const totals = await c.env.DB.prepare(
    `SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'fixed' THEN 1 ELSE 0 END) as fixed,
      SUM(CASE WHEN status = 'reported' THEN 1 ELSE 0 END) as reported,
      SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) as verified,
      SUM(CASE WHEN status = 'under_repair' THEN 1 ELSE 0 END) as under_repair
     FROM potholes WHERE deleted_at IS NULL`
  ).first()

  const byRegion = await c.env.DB.prepare(
    `SELECT r.id, r.name_ar, r.name_en,
       COUNT(p.id) as total,
       SUM(CASE WHEN p.status = 'fixed' THEN 1 ELSE 0 END) as fixed
     FROM regions r
     LEFT JOIN potholes p ON p.region_id = r.id AND p.deleted_at IS NULL
     WHERE r.active = 1
     GROUP BY r.id
     ORDER BY total DESC`
  ).all()

  const avgResponse = await c.env.DB.prepare(
    `SELECT AVG(julianday(fixed_at) - julianday(created_at)) as avg_days
     FROM potholes WHERE status = 'fixed' AND fixed_at IS NOT NULL AND deleted_at IS NULL`
  ).first<{ avg_days: number | null }>()

  const payload = {
    totals,
    by_region: byRegion.results,
    avg_response_days: avgResponse?.avg_days ?? null,
  }
  await c.env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 })
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// GET /api/potholes/recent-fixed - Recently repaired potholes with before/after
// thumbnails for the homepage showcase (public, cached 60s).
// ---------------------------------------------------------------------------
potholes.get('/recent-fixed', async (c) => {
  const cacheKey = 'recent_fixed:v1'
  const cached = await c.env.KV.get(cacheKey)
  if (cached) return c.json(JSON.parse(cached))

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.street_ar, p.street_en, p.fixed_at, p.created_at,
       r.name_ar as region_name_ar, r.name_en as region_name_en,
       (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.stage IN ('before','report') AND ph.deleted_at IS NULL ORDER BY CASE WHEN ph.stage = 'before' THEN 0 ELSE 1 END, ph.created_at ASC LIMIT 1) as before_thumb_key,
       (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.stage = 'after' AND ph.deleted_at IS NULL ORDER BY ph.created_at DESC LIMIT 1) as after_thumb_key
     FROM potholes p
     JOIN regions r ON r.id = p.region_id
     WHERE p.status = 'fixed' AND p.deleted_at IS NULL
     ORDER BY COALESCE(p.fixed_at, p.updated_at) DESC
     LIMIT 6`
  ).all()

  const payload = { results: rows.results }
  await c.env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 })
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// GET /api/potholes/showcase - homepage photo showcase (public, cached 60s).
//   fixed:       latest repaired reports that have photos (before / after)
//   in_progress: reports currently under repair that have photos
//                (before / during / report shots)
// Each item carries up to 3 thumbnails ordered by stage so the UI can show
// the repair progress without a second request.
// ---------------------------------------------------------------------------
potholes.get('/showcase', async (c) => {
  const cacheKey = 'showcase:v1'
  const cached = await c.env.KV.get(cacheKey)
  if (cached) return c.json(JSON.parse(cached))

  const select = `SELECT p.id, p.status, p.street_ar, p.street_en, p.fixed_at, p.under_repair_at, p.created_at,
       r.name_ar as region_name_ar, r.name_en as region_name_en,
       (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.stage IN ('before','report') AND ph.deleted_at IS NULL ORDER BY CASE WHEN ph.stage = 'before' THEN 0 ELSE 1 END, ph.created_at ASC LIMIT 1) as before_thumb_key,
       (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.stage = 'during' AND ph.deleted_at IS NULL ORDER BY ph.created_at DESC LIMIT 1) as during_thumb_key,
       (SELECT thumb_key FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.stage = 'after' AND ph.deleted_at IS NULL ORDER BY ph.created_at DESC LIMIT 1) as after_thumb_key
     FROM potholes p
     JOIN regions r ON r.id = p.region_id
     WHERE p.status = ? AND p.deleted_at IS NULL
       AND EXISTS (SELECT 1 FROM pothole_photos ph WHERE ph.pothole_id = p.id AND ph.deleted_at IS NULL)
     ORDER BY COALESCE(p.fixed_at, p.under_repair_at, p.updated_at) DESC
     LIMIT 6`

  const [fixed, inProgress] = await Promise.all([
    c.env.DB.prepare(select).bind('fixed').all(),
    c.env.DB.prepare(select).bind('under_repair').all(),
  ])

  const payload = { fixed: fixed.results, in_progress: inProgress.results }
  await c.env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 })
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// GET /api/potholes/top-reporter - homepage highlight (public, cached briefly)
// ---------------------------------------------------------------------------
potholes.get('/top-reporter', async (c) => {
  const cacheKey = 'top_reporter:v1'
  const cached = await c.env.KV.get(cacheKey)
  if (cached) return c.json(JSON.parse(cached))

  const top = await c.env.DB.prepare(
    `SELECT u.display_name, u.code, COUNT(*) as report_count
     FROM potholes p
     JOIN users u ON u.id = p.reporter_id
     WHERE p.reporter_id IS NOT NULL AND p.deleted_at IS NULL AND u.deleted_at IS NULL
     GROUP BY p.reporter_id
     ORDER BY report_count DESC
     LIMIT 1`
  ).first<{ display_name: string | null; code: string; report_count: number }>()

  const payload = {
    reporter: top ? { name: top.display_name || top.code, report_count: top.report_count } : null,
  }
  await c.env.KV.put(cacheKey, JSON.stringify(payload), { expirationTtl: 60 })
  return c.json(payload)
})

// ---------------------------------------------------------------------------
// GET /api/potholes/:id - detail (public)
// ---------------------------------------------------------------------------
potholes.get('/:id', attachAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const pothole = await c.env.DB.prepare(
    `SELECT p.*, r.name_ar as region_name_ar, r.name_en as region_name_en, r.slug as region_slug
     FROM potholes p JOIN regions r ON r.id = p.region_id
     WHERE p.id = ? AND p.deleted_at IS NULL`
  )
    .bind(id)
    .first<PotholeRow & { region_name_ar: string; region_name_en: string; region_slug: string }>()

  if (!pothole) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare('UPDATE potholes SET view_count = view_count + 1 WHERE id = ?').bind(id).run()

  const photos = await c.env.DB.prepare(
    'SELECT id, thumb_key, r2_key, stage, created_at FROM pothole_photos WHERE pothole_id = ? AND deleted_at IS NULL ORDER BY created_at ASC'
  )
    .bind(id)
    .all()

  const history = await c.env.DB.prepare(
    'SELECT from_status, to_status, note, at FROM status_history WHERE pothole_id = ? ORDER BY at ASC'
  )
    .bind(id)
    .all()

  const admin = isAdmin(c)
  if (admin) c.header('Cache-Control', 'private, no-store')
  return c.json({ pothole: admin ? pothole : toPublicReport(pothole), photos: photos.results, history: history.results })
})

// ---------------------------------------------------------------------------
// POST /api/potholes/:id/upvote - Citizen confirmation ("I saw this pothole too")
// ---------------------------------------------------------------------------
potholes.post('/:id/upvote', attachAuth, async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const existing = await c.env.DB.prepare('SELECT id, upvotes_count FROM potholes WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<{ id: number; upvotes_count: number }>()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  const authCtx = c.get('auth')
  const ip = clientIp(c)
  const ipHash = await hashIp(ip, c.env.JWT_SECRET)
  const voterKey = authCtx ? `user:${authCtx.userId}` : `ip:${ipHash}`

  const already = await c.env.DB.prepare(
    'SELECT id FROM pothole_upvotes WHERE pothole_id = ? AND voter_key = ?'
  )
    .bind(id, voterKey)
    .first()

  if (already) {
    return c.json({ ok: true, already_upvoted: true, upvotes_count: existing.upvotes_count })
  }

  await c.env.DB.prepare(
    'INSERT INTO pothole_upvotes (pothole_id, voter_key, user_id) VALUES (?, ?, ?)'
  )
    .bind(id, voterKey, authCtx?.userId ?? null)
    .run()

  await c.env.DB.prepare(
    'UPDATE potholes SET upvotes_count = upvotes_count + 1 WHERE id = ?'
  )
    .bind(id)
    .run()

  const updatedCount = (existing.upvotes_count || 0) + 1
  return c.json({ ok: true, already_upvoted: false, upvotes_count: updatedCount }, 201)
})

// ---------------------------------------------------------------------------
// POST /api/potholes - create a report (guest or authenticated)
// ---------------------------------------------------------------------------
potholes.post('/', attachAuth, async (c) => {
  const body = await c.req.json().catch(() => null)
  const parsed = createPotholeSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة', details: parsed.error.issues }, 400)
  }
  const data = parsed.data

  if (data.client_report_uuid) {
    const existingByUuid = await c.env.DB.prepare(
      'SELECT id, status FROM potholes WHERE client_report_uuid = ? AND deleted_at IS NULL'
    )
      .bind(data.client_report_uuid)
      .first<{ id: number; status: string }>()
    if (existingByUuid) {
      // Same device re-sending (offline sync retry): the uuid is private to that
      // device, so it may get a fresh photo-upload permit for its own report.
      return c.json(
        {
          id: existingByUuid.id,
          status: existingByUuid.status,
          deduplicated: true,
          upload_token: await createUploadToken(existingByUuid.id, c.env.JWT_SECRET),
        },
        200
      )
    }
  }

  const ip = clientIp(c)
  const ipRl = await checkRateLimit(c.env.KV, 'report_ip', ip, REPORT_LIMIT_PER_IP, REPORT_LIMIT_WINDOW_SECONDS)
  if (!ipRl.allowed) {
    return c.json({ error: 'Too many reports from this network, please try again later', error_ar: 'عدد بلاغات كبير من هذا الاتصال، حاول لاحقاً' }, 429)
  }

  const authCtx = c.get('auth')
  if (authCtx) {
    const userRl = await checkRateLimit(c.env.KV, 'report_user', String(authCtx.userId), REPORT_LIMIT_PER_USER, REPORT_LIMIT_WINDOW_SECONDS)
    if (!userRl.allowed) {
      return c.json({ error: 'Too many reports from this account, please try again later', error_ar: 'عدد بلاغات كبير من هذا الحساب، حاول لاحقاً' }, 429)
    }
  }

  if (!isPlausibleLibyaCoordinate({ lat: data.lat, lng: data.lng })) {
    return c.json({ error: 'Coordinates look out of range', error_ar: 'الموقع خارج النطاق المتوقع' }, 400)
  }

  let regionId = data.region_id
  if (!regionId) {
    const regions = await c.env.DB.prepare('SELECT id, center_lat as lat, center_lng as lng FROM regions WHERE active = 1').all<{ id: number; lat: number; lng: number }>()
    const nearest = nearestRegion({ lat: data.lat, lng: data.lng }, regions.results)
    regionId = nearest?.id
  }
  if (!regionId) {
    return c.json({ error: 'Could not determine region', error_ar: 'تعذر تحديد المنطقة' }, 400)
  }

  const result = await c.env.DB.prepare(
    `INSERT INTO potholes (region_id, reporter_id, reporter_contact, client_report_uuid, lat, lng, length_cm, width_cm, depth_cm,
       severity, description_ar, description_en, street_ar, street_en, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'reported')`
  )
    .bind(
      regionId,
      authCtx?.userId ?? null,
      data.reporter_contact ?? null,
      data.client_report_uuid ?? null,
      data.lat,
      data.lng,
      data.length_cm ?? null,
      data.width_cm ?? null,
      data.depth_cm ?? null,
      data.severity,
      data.description_ar ?? '',
      data.description_en ?? '',
      data.street_ar ?? '',
      data.street_en ?? '',
    )
    .run()

  const potholeId = result.meta.last_row_id as number

  await c.env.DB.prepare(
    `INSERT INTO status_history (pothole_id, from_status, to_status, actor_id, note) VALUES (?, NULL, 'reported', ?, 'Report submitted')`
  )
    .bind(potholeId, authCtx?.userId ?? null)
    .run()

  const box = boundingBoxForRadius({ lat: data.lat, lng: data.lng }, DUPLICATE_RADIUS_METERS)
  const nearby = await c.env.DB.prepare(
    `SELECT id, lat, lng FROM potholes
     WHERE id != ? AND deleted_at IS NULL AND status != 'fixed'
       AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?`
  )
    .bind(potholeId, box.minLat, box.maxLat, box.minLng, box.maxLng)
    .all<{ id: number; lat: number; lng: number }>()

  for (const candidate of nearby.results) {
    const distance = haversineDistanceMeters({ lat: data.lat, lng: data.lng }, candidate)
    if (distance <= DUPLICATE_RADIUS_METERS) {
      await c.env.DB.prepare(
        `INSERT INTO duplicate_flags (pothole_id, duplicate_of_id, distance_m) VALUES (?, ?, ?)`
      )
        .bind(potholeId, candidate.id, distance)
        .run()
    }
  }

  await invalidatePublicCaches(c.env.KV)
  await notifyAdmins(c.env.DB, 'new_report', { pothole_id: potholeId, severity: data.severity, region_id: regionId }, c.env)
  await recordAudit(c.env.DB, {
    actorId: authCtx?.userId ?? null,
    action: 'pothole.create',
    entity: 'potholes',
    entityId: potholeId,
    after: data,
    ipHash: await hashIp(ip, c.env.JWT_SECRET),
  })

  // Permit for this client to attach its photos (see src/lib/upload-token.ts).
  const uploadToken = await createUploadToken(potholeId, c.env.JWT_SECRET)
  return c.json({ id: potholeId, status: 'reported', upload_token: uploadToken }, 201)
})

// ---------------------------------------------------------------------------
// PATCH /api/potholes/:id/status - admin only, transitions lifecycle status
// ---------------------------------------------------------------------------
potholes.patch('/:id/status', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const id = Number(c.req.param('id'))
  const authCtx = c.get('auth')!
  const body = await c.req.json().catch(() => null)
  const parsed = updateStatusSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid input', error_ar: 'بيانات غير صحيحة' }, 400)

  const existing = await c.env.DB.prepare('SELECT * FROM potholes WHERE id = ? AND deleted_at IS NULL').bind(id).first<PotholeRow>()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  const { status, note } = parsed.data
  const timestampColumn: Record<string, string> = {
    verified: 'verified_at',
    under_repair: 'under_repair_at',
    fixed: 'fixed_at',
  }
  const col = timestampColumn[status]

  await c.env.DB.prepare(
    `INSERT INTO pending_status_change (pothole_id, actor_id, note) VALUES (?, ?, ?)
     ON CONFLICT(pothole_id) DO UPDATE SET actor_id = excluded.actor_id, note = excluded.note`
  )
    .bind(id, authCtx.userId, note ?? null)
    .run()

  const sql = col
    ? `UPDATE potholes SET status = ?, ${col} = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
    : `UPDATE potholes SET status = ? WHERE id = ?`
  await c.env.DB.prepare(sql).bind(status, id).run()

  await invalidatePublicCaches(c.env.KV)
  await recordAudit(c.env.DB, {
    actorId: authCtx.userId,
    action: 'pothole.status_change',
    entity: 'potholes',
    entityId: id,
    before: { status: existing.status },
    after: { status },
  })

  if (existing.reporter_id) {
    await notifyUser(c.env.DB, existing.reporter_id, 'status_change', { pothole_id: id, status }, c.env)
  }

  return c.json({ ok: true, status })
})

// ---------------------------------------------------------------------------
// DELETE /api/potholes/:id - admin / super_admin one-click report deletion
// Soft-deletes the report and its photos while preserving the immutable audit trail.
// ---------------------------------------------------------------------------
potholes.delete('/:id', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const id = Number(c.req.param('id'))
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: 'Invalid id' }, 400)

  const authCtx = c.get('auth')!
  const existing = await c.env.DB.prepare('SELECT * FROM potholes WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<PotholeRow>()
  if (!existing) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(
    `UPDATE potholes SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  )
    .bind(id)
    .run()

  await purgeReportPhotos(c.env.DB, c.env.PHOTOS, id)

  await invalidatePublicCaches(c.env.KV)
  await recordAudit(c.env.DB, {
    actorId: authCtx.userId,
    action: 'pothole.delete',
    entity: 'potholes',
    entityId: id,
    before: { status: existing.status, severity: existing.severity, region_id: existing.region_id },
  })

  return c.json({ ok: true, deleted_id: id })
})

// ---------------------------------------------------------------------------
// GET /api/potholes/mine/list - reports by the current authenticated user
// ---------------------------------------------------------------------------
potholes.get('/mine/list', attachAuth, async (c) => {
  const authCtx = c.get('auth')
  if (!authCtx) return c.json({ error: 'Authentication required', error_ar: 'يجب تسجيل الدخول' }, 401)

  const rows = await c.env.DB.prepare(
    `SELECT p.*, r.name_ar as region_name_ar, r.name_en as region_name_en
     FROM potholes p JOIN regions r ON r.id = p.region_id
     WHERE p.reporter_id = ? AND p.deleted_at IS NULL
     ORDER BY p.created_at DESC`
  )
    .bind(authCtx.userId)
    .all()

  return c.json({ results: rows.results })
})

export default potholes
