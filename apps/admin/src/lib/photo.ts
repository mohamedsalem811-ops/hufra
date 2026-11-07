import { PHOTO_LIMITS } from '@hufra/contracts'

/**
 * Prepares a repair-proof photo the way the server accepts it (the same rule
 * as the app): a JPEG at most 1280 px on the long edge and 400 KB, plus a
 * 320 px thumbnail under 64 KB. Re-drawing on a canvas drops all EXIF data
 * (GPS, device), which the server refuses.
 */
export interface Encoded {
  full: Blob
  thumb: Blob
}

export interface Canvas2D {
  load(file: Blob): Promise<{ width: number; height: number; draw: (w: number, h: number, quality: number) => Promise<Blob | null> }>
}

export const browserCanvas: Canvas2D = {
  async load(file) {
    const bitmap = await createImageBitmap(file)
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (w, h, quality) => {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(bitmap, 0, 0, w, h)
        return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      },
    }
  },
}

export function fit(width: number, height: number, longEdge: number) {
  const scale = Math.min(1, longEdge / Math.max(width, height))
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) }
}

async function encode(img: Awaited<ReturnType<Canvas2D['load']>>, longEdge: number, maxBytes: number): Promise<Blob> {
  const { w, h } = fit(img.width, img.height, longEdge)
  for (const quality of [0.85, 0.75, 0.65, 0.55, 0.45, 0.35]) {
    const blob = await img.draw(w, h, quality)
    if (blob && blob.size <= maxBytes) return blob
  }
  throw new Error('too-large')
}

/** One image under a size limit (a receipt): JPEG, no EXIF. */
export async function prepareSingle(file: Blob, longEdge: number, maxBytes: number, canvas: Canvas2D = browserCanvas): Promise<Blob> {
  return encode(await canvas.load(file), longEdge, maxBytes)
}

export async function preparePhoto(file: Blob, canvas: Canvas2D = browserCanvas): Promise<Encoded> {
  const img = await canvas.load(file)
  return {
    full: await encode(img, PHOTO_LIMITS.full.maxLongEdgePx, PHOTO_LIMITS.full.maxBytes),
    thumb: await encode(img, PHOTO_LIMITS.thumb.maxLongEdgePx, PHOTO_LIMITS.thumb.maxBytes),
  }
}
