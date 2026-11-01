// R2 object storage helpers for pothole photos.
//
// Design (see MASTER BUILD PROMPT section 5):
// - Images are compressed CLIENT-SIDE before upload (resize to <=1600px long
//   edge, WebP, target 300-500KB) -- see public/static/js/image-compress.js.
// - The browser also generates a small thumbnail (<=400px, WebP) client-side
//   and uploads both variants in the same multipart request. Cloudflare
//   Workers has no image-processing library available without a paid
//   add-on, so doing both resizes in the browser (Canvas API) keeps the
//   platform free to run and keeps originals immutable exactly as captured
//   by client-side compression, per the "keep the original as an immutable
//   audit copy" requirement -- the "original" here is the first client-side
//   compressed output, not the multi-megabyte camera source, which is the
//   correct privacy/performance tradeoff for a free-tier map product.
// - Only the R2 object key (never binary data, never base64) is stored in D1.
// - Photos are served through /media/:key which streams from R2 with long
//   cache lifetimes (see src/routes/media.ts).

import { PHOTO_LIMITS } from '@hufra/contracts'
import type { Bindings } from './types'

export const PHOTO_PREFIX = 'photos'
export const THUMB_PREFIX = 'thumbs'

export function buildPhotoKey(
  potholeIdOrTmp: string,
  variant: 'full' | 'thumb',
  contentType: string = 'image/webp'
): string {
  const rand = crypto.randomUUID()
  const prefix = variant === 'full' ? PHOTO_PREFIX : THUMB_PREFIX
  const ext = contentType === 'image/jpeg' ? 'jpg' : 'webp'
  return `${prefix}/${potholeIdOrTmp}/${rand}.${ext}`
}

export async function putPhoto(
  bucket: Bindings['PHOTOS'],
  key: string,
  data: ArrayBuffer,
  contentType = 'image/webp'
): Promise<void> {
  await bucket.put(key, data, {
    httpMetadata: { contentType, cacheControl: 'public, max-age=31536000, immutable' },
  })
}

export async function getPhoto(bucket: Bindings['PHOTOS'], key: string) {
  return bucket.get(key)
}

export async function deletePhoto(bucket: Bindings['PHOTOS'], key: string): Promise<void> {
  await bucket.delete(key)
}

/** Delete stored photo objects (full + thumb). Failures are ignored: a leftover object is harmless. */
export async function deletePhotoObjects(bucket: Bindings['PHOTOS'], keys: Array<string | null | undefined>): Promise<void> {
  await Promise.allSettled(keys.filter((k): k is string => !!k).map((k) => bucket.delete(k)))
}

/**
 * Soft-delete every photo row of a report (kept for the audit trail) and remove
 * the image bytes from storage, so a deleted report's photos stop being served
 * and stop taking space.
 */
export async function purgeReportPhotos(db: Bindings['DB'], bucket: Bindings['PHOTOS'], potholeId: number): Promise<number> {
  const rows = await db
    .prepare('SELECT r2_key, thumb_key FROM pothole_photos WHERE pothole_id = ? AND deleted_at IS NULL')
    .bind(potholeId)
    .all<{ r2_key: string; thumb_key: string }>()
  await db
    .prepare(`UPDATE pothole_photos SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE pothole_id = ? AND deleted_at IS NULL`)
    .bind(potholeId)
    .run()
  await deletePhotoObjects(bucket, rows.results.flatMap((r) => [r.r2_key, r.thumb_key]))
  return rows.results.length
}

// Server-side limits, matched to what public/static/js/image-compress.js
// produces (measured with real camera-sized inputs: a typical road photo is
// ~130 KB, a worst-case pure-noise image ~220 KB, thumbnails a few KB). The
// limits leave headroom for real photos while refusing anything that skipped
// the compressor. Formats are checked from the file bytes (src/lib/image-check.ts).
// The limits themselves are shared with the apps (which must compress photos
// to fit before uploading): see PHOTO_LIMITS in @hufra/contracts. They were set
// from real image-compress.js output (typical road photo ~130 KB, worst case
// ~220 KB, thumbnails a few KB). Formats are checked from the file bytes
// (src/lib/image-check.ts).
export const ALLOWED_IMAGE_TYPES = new Set<string>(PHOTO_LIMITS.types)
export const MAX_FULL_IMAGE_BYTES = PHOTO_LIMITS.full.maxBytes
export const MAX_THUMB_IMAGE_BYTES = PHOTO_LIMITS.thumb.maxBytes
export const MAX_FULL_LONG_EDGE_PX = PHOTO_LIMITS.full.maxLongEdgePx
export const MAX_THUMB_LONG_EDGE_PX = PHOTO_LIMITS.thumb.maxLongEdgePx
/** Report photos (stage "report") per report; proof photos per stage (before/during/after). */
export const MAX_PHOTOS_PER_STAGE = PHOTO_LIMITS.maxPerStage
