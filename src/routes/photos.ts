import { Hono } from 'hono'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'
import {
  buildPhotoKey,
  putPhoto,
  deletePhotoObjects,
  ALLOWED_IMAGE_TYPES,
  MAX_FULL_IMAGE_BYTES,
  MAX_THUMB_IMAGE_BYTES,
  MAX_FULL_LONG_EDGE_PX,
  MAX_THUMB_LONG_EDGE_PX,
  MAX_PHOTOS_PER_STAGE,
} from '../lib/storage'
import { inspectImage, type ImageInfo } from '../lib/image-check'
import { verifyUploadToken } from '../lib/upload-token'
import { checkRateLimit, UPLOAD_LIMIT_PER_IP, UPLOAD_LIMIT_WINDOW_SECONDS } from '../lib/rate-limit'
import { recordAudit } from '../lib/audit'
import { invalidatePublicCaches } from '../lib/cache'

const photos = new Hono<{ Bindings: Bindings }>()

function clientIp(c: any): string {
  return c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
}

const STAGES = ['report', 'before', 'during', 'after'] as const
type Stage = (typeof STAGES)[number]

const bad = (c: any, error: string, error_ar: string, status: 400 | 403 | 404 | 413 = 400) => c.json({ error, error_ar }, status)

/** Check one uploaded file against the compressor's output limits. Returns its real format/size or an error. */
async function checkImage(
  file: File,
  maxBytes: number,
  maxEdge: number
): Promise<{ info: ImageInfo; bytes: ArrayBuffer } | { error: string; error_ar: string; status: 400 | 413 }> {
  if (file.size > maxBytes) {
    return { error: 'Image too large: photos must be compressed by the app before upload', error_ar: 'الصورة كبيرة جداً: يجب ضغطها داخل التطبيق قبل الرفع', status: 413 }
  }
  const bytes = await file.arrayBuffer()
  const info = inspectImage(bytes)
  if (!info || !ALLOWED_IMAGE_TYPES.has(info.type)) {
    return { error: 'Unsupported or damaged image (WebP or JPEG only)', error_ar: 'صورة غير مدعومة أو تالفة (WebP أو JPEG فقط)', status: 400 }
  }
  if (Math.max(info.width, info.height) > maxEdge) {
    return { error: `Image too large: longest side must be at most ${maxEdge}px`, error_ar: `أبعاد الصورة كبيرة: الحد الأقصى ${maxEdge} بكسل`, status: 413 }
  }
  if (info.hasExif) {
    return { error: 'Image still contains camera metadata (EXIF); upload it through the app', error_ar: 'الصورة تحتوي بيانات الكاميرا (EXIF)، ارفعها عبر التطبيق', status: 400 }
  }
  return { info, bytes }
}

// ---------------------------------------------------------------------------
// POST /api/photos/:potholeId - upload one compressed photo (full + thumb).
// Multipart fields: full, thumb (required), stage, upload_token.
//
// Who may upload:
//   - stage "report": the client that created the report (it received an
//     upload_token from POST /api/potholes), the logged-in reporter, or an admin;
//   - stages before/during/after (repair proof): admins only.
// What is accepted: only WebP/JPEG files that really are the compressor's
// output size (bytes, pixel dimensions and no EXIF are checked server-side),
// at most MAX_PHOTOS_PER_STAGE per stage per report.
// ---------------------------------------------------------------------------
photos.post('/:potholeId', attachAuth, async (c) => {
  const ip = clientIp(c)
  const rl = await checkRateLimit(c.env, 'upload_ip', ip, UPLOAD_LIMIT_PER_IP, UPLOAD_LIMIT_WINDOW_SECONDS)
  if (!rl.allowed) {
    return c.json({ error: 'Too many uploads, please try again later', error_ar: 'رفع كثير جداً، حاول لاحقاً' }, 429)
  }

  const potholeId = Number(c.req.param('potholeId'))
  if (!Number.isInteger(potholeId) || potholeId <= 0) return c.json({ error: 'Invalid pothole id' }, 400)

  // Cheap guard before parsing a body: refuse anything far bigger than two compressed files.
  const declaredLength = Number(c.req.header('Content-Length') || 0)
  if (declaredLength > MAX_FULL_IMAGE_BYTES + MAX_THUMB_IMAGE_BYTES + 64 * 1024) {
    return bad(c, 'Upload too large', 'حجم الرفع كبير جداً', 413)
  }

  const pothole = await c.env.DB.prepare('SELECT id, reporter_id FROM potholes WHERE id = ? AND deleted_at IS NULL')
    .bind(potholeId)
    .first<{ id: number; reporter_id: number | null }>()
  if (!pothole) return bad(c, 'Pothole not found', 'البلاغ غير موجود', 404)

  const form = await c.req.parseBody({ all: true }).catch(() => null)
  if (!form) return bad(c, 'Invalid form data', 'بيانات غير صحيحة')

  const stageRaw = typeof form.stage === 'string' ? form.stage : 'report'
  const stage: Stage = (STAGES as readonly string[]).includes(stageRaw) ? (stageRaw as Stage) : 'report'

  const authCtx = c.get('auth')
  const isAdmin = authCtx?.role === 'admin' || authCtx?.role === 'super_admin'
  if (stage !== 'report' && !isAdmin) {
    return bad(c, 'Only admins may upload before/during/after proof photos', 'صور الإثبات للإدارة فقط', 403)
  }
  if (stage === 'report' && !isAdmin) {
    const isReporter = !!authCtx && pothole.reporter_id === authCtx.userId
    const hasPermit = await verifyUploadToken(form.upload_token, potholeId, c.env.JWT_SECRET)
    if (!isReporter && !hasPermit) {
      return bad(c, 'Only the person who filed this report can add photos to it', 'إضافة الصور متاحة لصاحب البلاغ فقط', 403)
    }
  }

  const existing = await c.env.DB.prepare(
    'SELECT COUNT(*) as n FROM pothole_photos WHERE pothole_id = ? AND stage = ? AND deleted_at IS NULL'
  )
    .bind(potholeId, stage)
    .first<{ n: number }>()
  if ((existing?.n ?? 0) >= MAX_PHOTOS_PER_STAGE) {
    return bad(c, `Maximum ${MAX_PHOTOS_PER_STAGE} photos per stage`, `الحد الأقصى ${MAX_PHOTOS_PER_STAGE} صور لكل مرحلة`)
  }

  const fullFile = form.full
  const thumbFile = form.thumb
  if (!(fullFile instanceof File) || !(thumbFile instanceof File)) {
    return bad(c, 'Both full and thumb images are required', 'مطلوب الصورة الكاملة والمصغرة')
  }

  const full = await checkImage(fullFile, MAX_FULL_IMAGE_BYTES, MAX_FULL_LONG_EDGE_PX)
  if ('error' in full) return bad(c, full.error, full.error_ar, full.status)
  const thumb = await checkImage(thumbFile, MAX_THUMB_IMAGE_BYTES, MAX_THUMB_LONG_EDGE_PX)
  if ('error' in thumb) return bad(c, thumb.error, thumb.error_ar, thumb.status)

  // Stored content type comes from the bytes, never from the client.
  const fullKey = buildPhotoKey(String(potholeId), 'full', full.info.type)
  const thumbKey = buildPhotoKey(String(potholeId), 'thumb', thumb.info.type)

  let photoId: number
  try {
    await putPhoto(c.env.PHOTOS, fullKey, full.bytes, full.info.type)
    await putPhoto(c.env.PHOTOS, thumbKey, thumb.bytes, thumb.info.type)
    const result = await c.env.DB.prepare(
      `INSERT INTO pothole_photos (pothole_id, r2_key, thumb_key, stage, width_px, height_px, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(potholeId, fullKey, thumbKey, stage, full.info.width, full.info.height, full.bytes.byteLength, authCtx?.userId ?? null)
      .run()
    photoId = result.meta.last_row_id as number
  } catch (err) {
    // Don't leave unreferenced objects behind in storage.
    await deletePhotoObjects(c.env.PHOTOS, [fullKey, thumbKey])
    throw err
  }

  await recordAudit(c.env.DB, {
    actorId: authCtx?.userId ?? null,
    action: 'photo.upload',
    entity: 'pothole_photos',
    entityId: photoId,
    after: { pothole_id: potholeId, stage, bytes: full.bytes.byteLength + thumb.bytes.byteLength },
  })

  await invalidatePublicCaches()
  return c.json({ id: photoId, r2_key: fullKey, thumb_key: thumbKey, stage }, 201)
})

photos.delete('/:photoId', attachAuth, requireRole('admin', 'super_admin'), async (c) => {
  const photoId = Number(c.req.param('photoId'))
  if (!Number.isInteger(photoId) || photoId <= 0) return c.json({ error: 'Invalid id' }, 400)
  const authCtx = c.get('auth')!

  const photo = await c.env.DB.prepare(
    'SELECT id, pothole_id, stage, r2_key, thumb_key FROM pothole_photos WHERE id = ? AND deleted_at IS NULL'
  )
    .bind(photoId)
    .first<{ id: number; pothole_id: number; stage: string; r2_key: string; thumb_key: string }>()
  if (!photo) return c.json({ error: 'Not found', error_ar: 'غير موجود' }, 404)

  await c.env.DB.prepare(`UPDATE pothole_photos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`)
    .bind(photoId)
    .run()
  // The DB row stays (soft-deleted) for the audit trail; the image bytes are
  // removed so they stop being publicly reachable and stop using storage.
  await deletePhotoObjects(c.env.PHOTOS, [photo.r2_key, photo.thumb_key])
  await invalidatePublicCaches()
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
