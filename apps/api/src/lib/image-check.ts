// Server-side check that an uploaded photo really is the small, re-encoded
// image produced by public/static/js/image-compress.js - not whatever a
// client chooses to send.
//
// The browser's declared Content-Type and file name are not trusted. Instead
// the first bytes of the file are read (no decoding, so this is cheap in a
// Worker) to find out:
//   - the real format (WebP or JPEG only - the compressor never emits anything
//     else, and PNG would be several times larger),
//   - the pixel dimensions (to enforce the compressor's max long edge),
//   - whether EXIF metadata is present. Canvas re-encoding always strips EXIF
//     (which can carry the phone's GPS position, model and time), so EXIF
//     means the file did not go through the compressor.

export type ImageKind = 'image/webp' | 'image/jpeg'

export interface ImageInfo {
  type: ImageKind
  width: number
  height: number
  hasExif: boolean
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = ''
  for (let i = 0; i < length && offset + i < bytes.length; i++) out += String.fromCharCode(bytes[offset + i])
  return out
}

const u16be = (b: Uint8Array, o: number) => (b[o] << 8) | b[o + 1]
const u16le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8)
const u24le = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8) | (b[o + 2] << 16)
const u32le = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0

function inspectJpeg(b: Uint8Array): ImageInfo | null {
  let o = 2
  let width = 0
  let height = 0
  let hasExif = false
  while (o + 4 <= b.length) {
    if (b[o] !== 0xff) return null
    const marker = b[o + 1]
    if (marker === 0xff) {
      o += 1 // fill byte
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break // end of image / start of scan
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      o += 2 // markers without a length
      continue
    }
    const len = u16be(b, o + 2)
    if (len < 2 || o + 2 + len > b.length) return null
    if (marker === 0xe1 && ascii(b, o + 4, 4) === 'Exif') hasExif = true
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof && len >= 7) {
      height = u16be(b, o + 5)
      width = u16be(b, o + 7)
    }
    o += 2 + len
  }
  if (!width || !height) return null
  return { type: 'image/jpeg', width, height, hasExif }
}

function inspectWebp(b: Uint8Array): ImageInfo | null {
  let width = 0
  let height = 0
  let hasExif = false
  let o = 12
  while (o + 8 <= b.length) {
    const id = ascii(b, o, 4)
    const size = u32le(b, o + 4)
    const d = o + 8
    if (id === 'VP8 ' && d + 10 <= b.length) {
      if (b[d + 3] !== 0x9d || b[d + 4] !== 0x01 || b[d + 5] !== 0x2a) return null
      width = width || u16le(b, d + 6) & 0x3fff
      height = height || u16le(b, d + 8) & 0x3fff
    } else if (id === 'VP8L' && d + 5 <= b.length) {
      if (b[d] !== 0x2f) return null
      const bits = u32le(b, d + 1)
      width = width || (bits & 0x3fff) + 1
      height = height || ((bits >>> 14) & 0x3fff) + 1
    } else if (id === 'VP8X' && d + 10 <= b.length) {
      if (b[d] & 0x08) hasExif = true
      width = u24le(b, d + 4) + 1
      height = u24le(b, d + 7) + 1
    } else if (id === 'EXIF') {
      hasExif = true
    }
    o = d + size + (size & 1) // chunks are padded to an even size
  }
  if (!width || !height) return null
  return { type: 'image/webp', width, height, hasExif }
}

/** Identify an image from its bytes. Returns null for anything that is not a well-formed WebP or JPEG. */
export function inspectImage(bytes: ArrayBuffer | Uint8Array): ImageInfo | null {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (b.length < 16) return null
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return inspectJpeg(b)
  if (ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 4) === 'WEBP') return inspectWebp(b)
  return null
}
