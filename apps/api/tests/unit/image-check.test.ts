import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { cleanPhoto, inspectImage, stripJpegMetadata } from '../../src/lib/image-check'

const FIX = path.resolve(__dirname, '../fixtures/photos')
const read = (n: string) => fs.readFileSync(path.join(FIX, n))

describe('inspectImage', () => {
  it('reads format and size of real compressor output', () => {
    expect(inspectImage(read('full.webp'))).toEqual({ type: 'image/webp', width: 1280, height: 960, hasExif: false })
    expect(inspectImage(read('thumb.webp'))).toEqual({ type: 'image/webp', width: 320, height: 240, hasExif: false })
    expect(inspectImage(read('full.jpg'))).toEqual({ type: 'image/jpeg', width: 1280, height: 960, hasExif: false })
    expect(inspectImage(read('thumb.jpg'))).toEqual({ type: 'image/jpeg', width: 320, height: 240, hasExif: false })
  })

  it('returns null for non-images and truncated files', () => {
    expect(inspectImage(new TextEncoder().encode('hello, definitely not an image'))).toBeNull()
    expect(inspectImage(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull()
    expect(inspectImage(read('full.jpg').subarray(0, 40))).toBeNull()
    expect(inspectImage(new Uint8Array(0))).toBeNull()
  })
})

describe('stripJpegMetadata / cleanPhoto: no metadata is ever stored', () => {
  const base = new Uint8Array(read('full.jpg'))
  const seg = (marker: number, tag: string, body: number[] = [1, 2, 3, 4]) => {
    const payload = [...[...tag].map((ch) => ch.charCodeAt(0)), ...body]
    const len = payload.length + 2
    return [0xff, marker, len >> 8, len & 0xff, ...payload]
  }
  const withSegments = (...segments: number[][]) => {
    const extra = segments.flat()
    const out = new Uint8Array(base.length + extra.length)
    out.set(base.subarray(0, 2), 0)
    out.set(extra, 2)
    out.set(base.subarray(2), 2 + extra.length)
    return out
  }

  it('removes EXIF, XMP, IPTC and comments, and keeps the image byte for byte', () => {
    const dirty = withSegments(seg(0xe1, 'Exif\0\0'), seg(0xe1, 'http://ns.adobe.com/xap/1.0/\0'), seg(0xed, 'Photoshop 3.0\0'), seg(0xfe, 'taken at 32.81N 13.02E'))
    expect(stripJpegMetadata(dirty)).toEqual(base)
    const cleaned = cleanPhoto(dirty.slice().buffer)
    expect(new Uint8Array(cleaned!.bytes)).toEqual(base)
    expect(cleaned!.info).toEqual({ type: 'image/jpeg', width: 1280, height: 960, hasExif: false })
  })

  it('keeps the colour profile (APP2) and the Adobe colour marker (APP14)', () => {
    const icc = seg(0xe2, 'ICC_PROFILE\0')
    const adobe = seg(0xee, 'Adobe')
    const out = stripJpegMetadata(withSegments(seg(0xe1, 'Exif\0\0'), icc, adobe))!
    expect(out.length).toBe(base.length + icc.length + adobe.length)
    expect([...out.subarray(2, 2 + icc.length)]).toEqual(icc)
  })

  it('refuses damaged files instead of guessing', () => {
    expect(stripJpegMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff]))).toBeNull()
    expect(stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
    expect(cleanPhoto(new Uint8Array([1, 2, 3]).buffer)).toBeNull()
  })

  it('leaves WebP untouched (the upload routes refuse WebP with metadata)', () => {
    const webp = new Uint8Array(read('full.webp'))
    const cleaned = cleanPhoto(webp.slice().buffer)
    expect(new Uint8Array(cleaned!.bytes)).toEqual(webp)
  })
})
