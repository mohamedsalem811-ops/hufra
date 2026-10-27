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

import type { Bindings } from './types'

export const PHOTO_PREFIX = 'photos'
export const THUMB_PREFIX = 'thumbs'

export function buildPhotoKey(potholeIdOrTmp: string, variant: 'full' | 'thumb'): string {
  const rand = crypto.randomUUID()
  const prefix = variant === 'full' ? PHOTO_PREFIX : THUMB_PREFIX
  return `${prefix}/${potholeIdOrTmp}/${rand}.webp`
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

export const ALLOWED_IMAGE_TYPES = new Set(['image/webp', 'image/jpeg', 'image/png'])
export const MAX_FULL_IMAGE_BYTES = 700 * 1024 // hard ceiling, compression target is 300-500KB
export const MAX_THUMB_IMAGE_BYTES = 150 * 1024
