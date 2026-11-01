import { describe, it, expect } from 'vitest'
import {
  buildPhotoKey,
  putPhoto,
  getPhoto,
  deletePhoto,
  ALLOWED_IMAGE_TYPES,
  MAX_FULL_IMAGE_BYTES,
  MAX_THUMB_IMAGE_BYTES,
  PHOTO_PREFIX,
  THUMB_PREFIX,
} from '../../src/lib/storage'
import { FakeR2Bucket } from '../integration/helpers/fake-bindings'

describe('buildPhotoKey', () => {
  it('builds a full-image key under the photos/ prefix', () => {
    const key = buildPhotoKey('42', 'full')
    expect(key.startsWith(`${PHOTO_PREFIX}/42/`)).toBe(true)
    expect(key.endsWith('.webp')).toBe(true)
  })

  it('builds a thumbnail key under the thumbs/ prefix', () => {
    const key = buildPhotoKey('42', 'thumb')
    expect(key.startsWith(`${THUMB_PREFIX}/42/`)).toBe(true)
  })

  it('uses a .jpg extension for JPEG photos', () => {
    expect(buildPhotoKey('42', 'full', 'image/jpeg').endsWith('.jpg')).toBe(true)
  })

  it('generates unique keys on each call', () => {
    const a = buildPhotoKey('42', 'full')
    const b = buildPhotoKey('42', 'full')
    expect(a).not.toBe(b)
  })
})

describe('putPhoto / getPhoto / deletePhoto', () => {
  it('round-trips binary data through the bucket', async () => {
    const bucket = new FakeR2Bucket()
    const key = buildPhotoKey('42', 'full')
    const data = new TextEncoder().encode('fake-webp-bytes').buffer as ArrayBuffer

    await putPhoto(bucket as any, key, data)
    const fetched = await getPhoto(bucket as any, key)
    expect(fetched).not.toBeNull()
    expect(new TextDecoder().decode(await fetched!.arrayBuffer())).toBe('fake-webp-bytes')
  })

  it('returns null for a missing key', async () => {
    const bucket = new FakeR2Bucket()
    const fetched = await getPhoto(bucket as any, 'photos/does-not-exist.webp')
    expect(fetched).toBeNull()
  })

  it('deletes a stored photo', async () => {
    const bucket = new FakeR2Bucket()
    const key = buildPhotoKey('42', 'full')
    await putPhoto(bucket as any, key, new ArrayBuffer(10))
    await deletePhoto(bucket as any, key)
    const fetched = await getPhoto(bucket as any, key)
    expect(fetched).toBeNull()
  })
})

describe('storage constants', () => {
  it('allows only the formats the compressor emits (webp/jpeg)', () => {
    expect(ALLOWED_IMAGE_TYPES.has('image/webp')).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has('image/jpeg')).toBe(true)
    expect(ALLOWED_IMAGE_TYPES.has('image/png')).toBe(false)
    expect(ALLOWED_IMAGE_TYPES.has('image/gif')).toBe(false)
    expect(ALLOWED_IMAGE_TYPES.has('application/pdf')).toBe(false)
  })

  it('keeps the full-image ceiling above the ~180 KB compression target but well under the old 700 KB', () => {
    expect(MAX_FULL_IMAGE_BYTES).toBeGreaterThan(250 * 1024)
    expect(MAX_FULL_IMAGE_BYTES).toBeLessThanOrEqual(400 * 1024)
  })

  it('enforces a thumbnail ceiling', () => {
    expect(MAX_THUMB_IMAGE_BYTES).toBeLessThan(MAX_FULL_IMAGE_BYTES)
  })
})
