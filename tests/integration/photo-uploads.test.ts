// Photo uploads: only the report's author (upload permit / logged-in
// reporter) or an admin may add photos, and only small, re-encoded WebP/JPEG
// files the size of the app's compressor output are stored.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'
import { createUploadToken } from '../../src/lib/upload-token'

const FIX = path.resolve(__dirname, '../fixtures/photos')
const fixture = (name: string) => new Uint8Array(fs.readFileSync(path.join(FIX, name)))
const FULL_WEBP = fixture('full.webp') // real image-compress.js output, 1280x960
const THUMB_WEBP = fixture('thumb.webp') // 320x240
const FULL_JPG = fixture('full.jpg') // JPEG fallback (iOS Safari), 1280x960
const THUMB_JPG = fixture('thumb.jpg')
const PW = 'Str0ngP@ssw0rd!'

let t: TestEnv
beforeEach(() => {
  t = createTestEnv()
})

function form(full: Uint8Array, thumb: Uint8Array, extra: Record<string, string> = {}, type = 'image/webp') {
  const fd = new FormData()
  fd.append('full', new File([full], 'photo', { type }))
  fd.append('thumb', new File([thumb], 'thumb', { type }))
  for (const [k, v] of Object.entries(extra)) fd.append(k, v)
  return fd
}

const upload = (id: number, fd: FormData, token?: string) =>
  request(t.env, `/api/photos/${id}`, {
    method: 'POST',
    body: fd,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  })

async function createReport(token?: string) {
  const res = await request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium' }),
  })
  return json(res) as Promise<{ id: number; upload_token: string }>
}

async function userToken(email: string, role: 'user' | 'admin' = 'user') {
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, consent: true }),
  })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const res = await request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  })
  return (await json(res)).access_token as string
}

/** Minimal WebP header (VP8X) declaring the given canvas size; enough for the header check. */
function webpHeader(width: number, height: number, exifFlag = false) {
  const b = new Uint8Array(64)
  const dv = new DataView(b.buffer)
  b.set([...'RIFF'].map((ch) => ch.charCodeAt(0)), 0)
  dv.setUint32(4, b.length - 8, true)
  b.set([...'WEBPVP8X'].map((ch) => ch.charCodeAt(0)), 8)
  dv.setUint32(16, 10, true)
  b[20] = exifFlag ? 0x08 : 0
  const w = width - 1
  const h = height - 1
  b.set([w & 255, (w >> 8) & 255, (w >> 16) & 255, h & 255, (h >> 8) & 255, (h >> 16) & 255], 24)
  return b
}

/** The fixture JPEG with an EXIF (APP1) segment inserted, as a phone camera would write it. */
function jpegWithExif() {
  const exif = new Uint8Array([0xff, 0xe1, 0x00, 0x10, ...[...'Exif'].map((ch) => ch.charCodeAt(0)), 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8])
  const out = new Uint8Array(FULL_JPG.length + exif.length)
  out.set(FULL_JPG.subarray(0, 2), 0)
  out.set(exif, 2)
  out.set(FULL_JPG.subarray(2), 2 + exif.length)
  return out
}

describe('who may upload report photos', () => {
  it('the guest who created the report, using the upload permit it received', async () => {
    const report = await createReport()
    expect(report.upload_token).toBeTruthy()
    const res = await upload(report.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: report.upload_token }))
    expect(res.status).toBe(201)
  })

  it('nobody else: no permit, or a permit for another report, is refused', async () => {
    const mine = await createReport()
    const other = await createReport()
    expect((await upload(other.id, form(FULL_WEBP, THUMB_WEBP))).status).toBe(403)
    expect((await upload(other.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: mine.upload_token }))).status).toBe(403)
    expect((await upload(other.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: 'forged.123.abcdefghijklmnopqrstuvwxyz' }))).status).toBe(403)
    const stranger = await userToken('stranger@example.com')
    expect((await upload(other.id, form(FULL_WEBP, THUMB_WEBP), stranger)).status).toBe(403)
    expect(t.photos.size).toBe(0)
  })

  it('an expired permit is refused', async () => {
    const report = await createReport()
    const old = await createUploadToken(report.id, t.env.JWT_SECRET, Date.now() - 7 * 3600 * 1000)
    expect((await upload(report.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: old }))).status).toBe(403)
  })

  it('the logged-in reporter can add photos without the permit', async () => {
    const me = await userToken('me@example.com')
    const report = await createReport(me)
    expect((await upload(report.id, form(FULL_WEBP, THUMB_WEBP), me)).status).toBe(201)
  })

  it('an offline-sync retry (same device uuid) gets a fresh permit for its own report', async () => {
    const body = JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'medium', client_report_uuid: 'device-abc-123' })
    const post = () => request(t.env, '/api/potholes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
    const first = await json(await post())
    const retry = await json(await post())
    expect(retry.deduplicated).toBe(true)
    expect(retry.id).toBe(first.id)
    expect((await upload(retry.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: retry.upload_token }))).status).toBe(201)
  })

  it('repair-proof stages are admin-only; admins need no permit', async () => {
    const report = await createReport()
    const user = await userToken('u@example.com')
    const admin = await userToken('a@example.com', 'admin')
    const proof = (tok: string) => upload(report.id, form(FULL_WEBP, THUMB_WEBP, { stage: 'after', upload_token: report.upload_token }), tok)
    expect((await proof(user)).status).toBe(403)
    expect((await proof(admin)).status).toBe(201)
    expect((await upload(report.id, form(FULL_WEBP, THUMB_WEBP), admin)).status).toBe(201)
  })
})

describe('only compressed photos are stored', () => {
  it('accepts the real compressor output in both formats and stores the type read from the bytes', async () => {
    const report = await createReport()
    const tok = { upload_token: report.upload_token }
    // The client claims PNG; the server goes by the actual bytes.
    const webp = await json(await upload(report.id, form(FULL_WEBP, THUMB_WEBP, tok, 'image/png')))
    const jpg = await json(await upload(report.id, form(FULL_JPG, THUMB_JPG, tok, 'image/jpeg')))
    expect(webp.r2_key).toMatch(/\.webp$/)
    expect(jpg.r2_key).toMatch(/\.jpg$/)
    const obj = await t.photos.get(jpg.r2_key)
    expect(obj?.httpMetadata?.contentType).toBe('image/jpeg')
    const row = await t.db.prepare('SELECT width_px, height_px FROM pothole_photos WHERE id = ?').bind(jpg.id).first<any>()
    expect([row.width_px, row.height_px]).toEqual([1280, 960])
  })

  it('refuses files over the size limit', async () => {
    const report = await createReport()
    const big = new Uint8Array(450 * 1024)
    big.set(FULL_WEBP)
    const res = await upload(report.id, form(big, THUMB_WEBP, { upload_token: report.upload_token }))
    expect(res.status).toBe(413)
  })

  it('refuses images larger than the compressor produces (full > 1280px, thumb > 320px)', async () => {
    const report = await createReport()
    const tok = { upload_token: report.upload_token }
    expect((await upload(report.id, form(webpHeader(4032, 3024), THUMB_WEBP, tok))).status).toBe(413)
    expect((await upload(report.id, form(FULL_WEBP, FULL_WEBP, tok))).status).toBe(413) // full-size image as thumb
  })

  it('refuses photos that still carry camera EXIF metadata (GPS, device)', async () => {
    const report = await createReport()
    const tok = { upload_token: report.upload_token }
    expect((await upload(report.id, form(jpegWithExif(), THUMB_JPG, tok, 'image/jpeg'))).status).toBe(400)
    expect((await upload(report.id, form(webpHeader(1280, 960, true), THUMB_WEBP, tok))).status).toBe(400)
  })

  it('refuses PNG and non-images, whatever type the client declares', async () => {
    const report = await createReport()
    const tok = { upload_token: report.upload_token }
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...new Array(40).fill(0)])
    const text = new TextEncoder().encode('<script>alert(1)</script> definitely a webp')
    expect((await upload(report.id, form(png, THUMB_WEBP, tok, 'image/png'))).status).toBe(400)
    expect((await upload(report.id, form(text, THUMB_WEBP, tok, 'image/webp'))).status).toBe(400)
    expect(t.photos.size).toBe(0)
  })

  it('limits each stage to 3 photos per report', async () => {
    const report = await createReport()
    const tok = { upload_token: report.upload_token }
    for (let i = 0; i < 3; i++) expect((await upload(report.id, form(FULL_WEBP, THUMB_WEBP, tok))).status).toBe(201)
    expect((await upload(report.id, form(FULL_WEBP, THUMB_WEBP, tok))).status).toBe(400)
  })
})

describe('deleting photos frees storage', () => {
  it('deleting one photo removes its image files', async () => {
    const report = await createReport()
    const up = await json(await upload(report.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: report.upload_token })))
    expect(t.photos.has(up.r2_key) && t.photos.has(up.thumb_key)).toBe(true)
    const admin = await userToken('a@example.com', 'admin')
    await request(t.env, `/api/photos/${up.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${admin}` } })
    expect(t.photos.has(up.r2_key) || t.photos.has(up.thumb_key)).toBe(false)
    expect((await request(t.env, `/media/${up.r2_key}`)).status).toBe(404)
  })

  it('deleting a report, or confirming it as a duplicate, removes all its image files', async () => {
    const admin = await userToken('a@example.com', 'admin')
    const auth = { Authorization: `Bearer ${admin}`, 'Content-Type': 'application/json' }

    const a = await createReport()
    await upload(a.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: a.upload_token }))
    await upload(a.id, form(FULL_JPG, THUMB_JPG, { upload_token: a.upload_token }))
    expect(t.photos.size).toBe(4)
    await request(t.env, `/api/potholes/${a.id}`, { method: 'DELETE', headers: auth })
    expect(t.photos.size).toBe(0)

    const original = await createReport()
    const dup = await createReport() // same spot -> flagged as duplicate
    await upload(dup.id, form(FULL_WEBP, THUMB_WEBP, { upload_token: dup.upload_token }))
    const flags = await json(await request(t.env, '/api/admin/duplicates', { headers: auth }))
    const flag = flags.results.find((f: any) => f.pothole_id === dup.id)
    await request(t.env, `/api/admin/duplicates/${flag.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ decision: 'confirmed' }) })
    expect(t.photos.size).toBe(0)
    expect(original.id).toBeLessThan(dup.id)
  })
})
