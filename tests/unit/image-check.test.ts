import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { inspectImage } from '../../src/lib/image-check'

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
