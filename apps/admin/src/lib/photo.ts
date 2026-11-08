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

/**
 * A partner logo as the server accepts it: PNG (keeps transparency), at most
 * 1024 px on the long edge, under 300 KB. SVG files are drawn onto a canvas
 * here, so no SVG (which can carry script) is ever stored or served.
 */
export interface LogoCanvas {
  load(file: Blob): Promise<{ width: number; height: number; draw: (w: number, h: number, type: string, quality?: number) => Promise<Blob | null> }>
}

export const browserLogoCanvas: LogoCanvas = {
  load(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        // SVGs without a size report 0: give them a square canvas.
        const width = img.naturalWidth || 1024
        const height = img.naturalHeight || 1024
        resolve({
          width,
          height,
          draw: (w, h, type, quality) => {
            const canvas = document.createElement('canvas')
            canvas.width = w
            canvas.height = h
            canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
            URL.revokeObjectURL(url)
            return new Promise((done) => canvas.toBlob(done, type, quality))
          },
        })
      }
      img.onerror = () => {
        URL.revokeObjectURL(url)
        reject(new Error('unreadable'))
      }
      img.src = url
    })
  },
}

export async function prepareLogo(file: Blob, canvas: LogoCanvas = browserLogoCanvas, maxBytes = 300 * 1024): Promise<Blob> {
  const img = await canvas.load(file)
  // Small logos are drawn larger (crisp on phones), big ones smaller.
  const scale = Math.min(1024 / Math.max(img.width, img.height), Math.max(1, 512 / Math.max(img.width, img.height)))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const pngBlob = await img.draw(w, h, 'image/png')
  if (pngBlob && pngBlob.size <= maxBytes) return pngBlob
  for (const q of [0.9, 0.8, 0.7]) {
    const webp = await img.draw(w, h, 'image/webp', q)
    if (webp && webp.type === 'image/webp' && webp.size <= maxBytes) return webp
  }
  throw new Error('too-large')
}
