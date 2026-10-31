import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'
import {
  buildPhotoKey,
  putPhoto,
  ALLOWED_IMAGE_TYPES,
  MAX_FULL_IMAGE_BYTES,
  MAX_THUMB_IMAGE_BYTES,
} from '../lib/storage'
import { checkRateLimit, UPLOAD_LIMIT_PER_IP, UPLOAD_LIMIT_WINDOW_SECONDS } from '../lib/rate-limit'
import { recordAudit } from '../lib/audit'
import { MAX_PHOTOS_PER_REPORT } from '../lib/types'
import { invalidatePublicCaches } from '../lib/cache'

const photos = new Hono<{ Bindings: Bindings }>()

function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
}

// ---------------------------------------------------------------------------
// POST /api/photos/:potholeId - upload 1-3 already-compressed images.
// Expects multipart/form-data with fields "full" and "thumb" (both required),
// produced client-side by public/static/js/image-compress.js. Stage defaults
// to "report"; admins may pass a different stage (before/during/after).
// ---------------------------------------------------------------------------
photos.post('/:potholeId', attachAuth, async (c) => {
  const ip = clientIp(c)
  const rl = await checkRateLimit(c.env.KV, 'upload_ip', ip, UPLOAD_LIMIT_PER_IP, UPLOAD_LIMIT_WINDOW_SECONDS)
  if (!rl.allowed) {
    return c.json({ error: 'Too many uploads, please try again later', error_ar: 'رفع كثير جداً، حاول لاحقاً' }, 429)
  }

  const potholeId = Number(c.req.param('potholeId'))
  if (!Number.isInteger(potholeId) || potholeId <= 0) return c.json({ error: 'Invalid pothole id' }, 400)

  const pothole = await c.env.DB.prepare('SELECT id FROM potholes WHERE id = ? AND deleted_at IS NULL').bind(potholeId).first()
  if (!pothole) return c.json({ error: 'Pothole not found', error_ar: 'البلاغ غير موجود' }, 404)

  const authCtx = c.get('auth')
  const isAdmin = authCtx?.role === 'admin' || authCtx?.role === 'super_admin'

  const existingCount = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM pothole_photos WHERE pothole_id = ? AND stage = 'report' AND deleted_at IS NULL"
  )
    .bind(potholeId)
    .first<{ n: number }>()

  const form = await c.req.parseBody({ all: true }).catch(() => null)
  if (!form) return c.json({ error: 'Invalid form data', error_ar: 'بيانات غير صحيحة' }, 400)

  const stageRaw = typeof form.stage === 'string' ? form.stage : 'report'
  const stage = (['report', 'before', 'during', 'after'] as const).includes(stageRaw as any) ? stageRaw : 'report'

  if (stage !== 'report' && !isAdmin) {
    return c.json({ error: 'Only admins may upload before/during/after proof photos', error_ar: 'صور الإثبات للإدارة فقط' }, 403)
  }
  if (stage === 'report' && (existingCount?.n ?? 0) >= MAX_PHOTOS_PER_REPORT) {
    return c.json({ error: `Maximum ${MAX_PHOTOS_PER_REPORT} photos per report`, error_ar: 'الحد الأقصى 3 صور لكل بلاغ' }, 400)
  }

  const fullFile = form.full
  const thumbFile = form.thumb
  if (!(fullFile instanceof File) || !(thumbFile instanceof File)) {
    return c.json({ error: 'Both full and thumb images are required', error_ar: 'مطلوب الصورة الكاملة والمصغرة' }, 400)
  }

  if (!ALLOWED_IMAGE_TYPES.has(fullFile.type) || !ALLOWED_IMAGE_TYPES.has(thumbFile.type)) {
    return c.json({ error: 'Unsupported image type', error_ar: 'صيغة صورة غير مدعومة' }, 400)
  }
  if (fullFile.size > MAX_FULL_IMAGE_BYTES) {
    return c.json({ error: 'Image too large after compression', error_ar: 'الصورة كبيرة جداً بعد الضغط' }, 400)
  }
  if (thumbFile.size > MAX_THUMB_IMAGE_BYTES) {
    return c.json({ error: 'Thumbnail too large', error_ar: 'الصورة المصغرة كبيرة جداً' }, 400)
  }

  const fullKey = buildPhotoKey(String(potholeId), 'full')
  const thumbKey = buildPhotoKey(String(potholeId), 'thumb')

  await putPhoto(c.env.PHOTOS, fullKey, await fullFile.arrayBuffer(), fullFile.type)
  await putPhoto(c.env.PHOTOS, thumbKey, await thumbFile.arrayBuffer(), thumbFile.type)

  const widthPx = form.width_px ? Number(form.width_px) : null
  const heightPx = form.height_px ? Number(form.height_px) : null

  const result = await c.env.DB.prepare(
    `INSERT INTO pothole_photos (pothole_id, r2_key, thumb_key, stage, width_px, height_px, size_bytes, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(potholeId, fullKey, thumbKey, stage, widthPx, heightPx, fullFile.size, authCtx?.userId ?? null)
    .run()

  await recordAudit(c.env.DB, {
    actorId: authCtx?.userId ?? null,
    action: 'photo.upload',
    entity: 'pothole_photos',
    entityId: result.meta.last_row_id as number,
    after: { pothole_id: potholeId, stage },
  })

  await invalidatePublicCaches(c.env.KV)
  return c.json({ id: result.meta.last_row_id, r2_key: fullKey, thumb_key: thumbKey, stage }, 201)
})

photos.delete('/:photoId', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const photoId = Number(c.req.param('photoId'))
  if (!Number.isInteger(photoId) || photoId <= 0) return c.json({ error: 'Invalid id' }, 400)
  const authCtx = c.get('auth')!

  const photo = await c.env.DB.prepare(
    'SELECT id, pothole_id, stage FROM pothole_photos WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(photoId)
    .first<{ id: number; pothole_id: number; stage: string }>()
  if (!photo) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(`UPDATE pothole_photos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(photoId)
    .run()
  await invalidatePublicCaches(c.env.KV)
  await recordAudit(c.env.DB, {
    actorId: authCtx.userId,
    action: 'photo.delete',
    entity: 'pothole_photos',
    entityId: photoId,
    before: { pothole_id: photo.pothole_id, stage: photo.stage },
  })
  return c.json({ ok: true, deleted_id: photoId })
})

export default photos
