// Transfer screenshots are made small in the browser before upload (plan 6.9):
// redrawn on a canvas, which also drops hidden data such as location (EXIF),
// as JPEG within the server's limits (DONATION_LIMITS.proof).

export interface ProofLimits {
  maxBytes: number
  maxLongEdgePx: number
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      // Older browsers: no options, or no support for this file; try an <img>.
    }
  }
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => (URL.revokeObjectURL(url), resolve(img))
    img.onerror = () => (URL.revokeObjectURL(url), reject(new Error('decode')))
    img.src = url
  })
}

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))

/** The smallest-loss JPEG that fits: lower quality first, then smaller sizes. */
export async function compressProof(file: Blob, limits: ProofLimits): Promise<Blob> {
  const img = await decode(file)
  const w = img.width
  const h = img.height
  if (!w || !h) throw new Error('decode')
  for (const edge of [limits.maxLongEdgePx, 1280, 1000]) {
    const scale = Math.min(1, edge / Math.max(w, h))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(w * scale)
    canvas.height = Math.round(h * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas')
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const blob = await toBlob(canvas, q)
      if (blob && blob.size <= limits.maxBytes) return blob
    }
  }
  throw new Error('too-large')
}
