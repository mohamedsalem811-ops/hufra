// Plan 8.2: partners - management, public lists by place and date, one
// featured partner, order, logos (never SVG), and "supported by" campaigns
// with funded numbers counted automatically.
import { describe, it, expect, beforeEach } from 'vitest'
import zlib from 'node:zlib'
import type { z } from 'zod'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
let t: TestEnv
const H = (token?: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
const get = (p: string, token?: string) => request(t.env, p, { headers: H(token) })
const send = (method: string, p: string, body: unknown, token?: string) => request(t.env, p, { method, headers: H(token), body: JSON.stringify(body) })

async function parse<S extends z.ZodType>(res: Response, schema: S, status = 200): Promise<z.infer<S>> {
  const body = await json(res)
  expect(res.status, JSON.stringify(body)).toBe(status)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(`Contract mismatch: ${JSON.stringify(parsed.error.issues)}`)
  return parsed.data
}
async function account(email: string, role?: 'admin' | 'super_admin') {
  await send('POST', '/api/auth/register', { email, password: PW, consent: true })
  if (role) await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const body = await json(await send('POST', '/api/auth/login', { email, password: PW }))
  return { token: body.access_token as string, id: body.user.id as number }
}

/** A real PNG of the given size, optionally with a text chunk (metadata). */
function png(width: number, height: number, text = false): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buf: Buffer) => {
    let c = 0xffffffff
    for (const b of buf) c = crcTable[(c ^ b) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const sum = Buffer.alloc(4)
    sum.writeUInt32BE(crc(body))
    return Buffer.concat([len, body, sum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height)
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      ...(text ? [chunk('tEXt', Buffer.from('Author\0someone'))] : []),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ])
  )
}

const partner = (over: Partial<C.PartnerInput> = {}): C.PartnerInput => ({
  name_ar: 'مصرف الجمهورية', name_en: 'Jumhouria Bank', description_ar: 'يموّل إصلاح الحفر', description_en: 'Funds pothole repairs', website: 'https://bank.ly',
  kind: 'repair_sponsor', starts_on: null, ends_on: null, show_home: true, show_about: true, show_app: true, show_campaigns: true, featured: false, visible: true, ...over,
})

let admin: { token: string; id: number }
let citizen: { token: string; id: number }
beforeEach(async () => {
  t = createTestEnv()
  admin = await account('team@hufra.ly', 'admin')
  citizen = await account('citizen@hufra.ly')
})
const create = async (over: Partial<C.PartnerInput> = {}) =>
  (await parse(await send('POST', '/api/admin/partners', partner(over), admin.token), C.adminPartnerResponseSchema, 201)).partner
const publicList = async (place = 'home') => (await parse(await get(`/api/partners?place=${place}`), C.publicPartnerListResponseSchema)).results

describe('managing partners', () => {
  it('adds partners in order and only staff may', async () => {
    expect((await send('POST', '/api/admin/partners', partner(), citizen.token)).status).toBe(403)
    expect((await send('POST', '/api/admin/partners', partner({ website: 'http://bank.ly' }), admin.token)).status).toBe(400)
    expect((await send('POST', '/api/admin/partners', partner({ starts_on: '2027-01-02', ends_on: '2027-01-01' }), admin.token)).status).toBe(400)
    const a = await create()
    const b = await create({ name_ar: 'ليبيانا', name_en: 'Libyana', kind: 'tech' })
    expect([a.sort_order, b.sort_order]).toEqual([1, 2])
    expect(a).toMatchObject({ live: true, funded_count: 0, funded_lyd: 0, logo_key: null })
  })

  it('reorders, keeps one featured partner, hides and deletes', async () => {
    const a = await create()
    const b = await create({ name_en: 'B' })
    const c = await create({ name_en: 'C', featured: true })
    const order = await parse(await send('PUT', '/api/admin/partners/order', { ids: [c.id, a.id, b.id] }, admin.token), C.adminPartnerListResponseSchema)
    expect(order.results.map((p) => p.id)).toEqual([c.id, a.id, b.id])

    await send('PUT', `/api/admin/partners/${b.id}`, partner({ name_en: 'B', featured: true }), admin.token)
    const all = await parse(await get('/api/admin/partners', admin.token), C.adminPartnerListResponseSchema)
    expect(all.results.filter((p) => p.featured).map((p) => p.id)).toEqual([b.id])

    // Public: featured first, then the team's order; hidden ones never.
    expect((await publicList()).map((p) => p.id)).toEqual([b.id, c.id, a.id])
    await send('PUT', `/api/admin/partners/${a.id}`, partner({ visible: false }), admin.token)
    expect((await publicList()).map((p) => p.id)).toEqual([b.id, c.id])

    expect((await send('DELETE', `/api/admin/partners/${c.id}`, {}, admin.token)).status).toBe(200)
    expect((await publicList()).map((p) => p.id)).toEqual([b.id])
    expect((await parse(await get('/api/admin/partners', admin.token), C.adminPartnerListResponseSchema)).results).toHaveLength(2)
    expect((await send('PUT', `/api/admin/partners/${c.id}`, partner(), admin.token)).status).toBe(404)
  })

  it('shows each partner only where and when the team chose', async () => {
    const appOnly = await create({ name_en: 'App', show_home: false, show_about: false })
    const past = await create({ name_en: 'Past', ends_on: '2020-01-01' })
    const future = await create({ name_en: 'Future', starts_on: '2999-01-01' })
    expect((await publicList('home')).map((p) => p.id)).toEqual([])
    expect((await publicList('app')).map((p) => p.id)).toEqual([appOnly.id])
    const all = await parse(await get('/api/admin/partners', admin.token), C.adminPartnerListResponseSchema)
    expect(all.results.find((p) => p.id === past.id)!.live).toBe(false)
    expect(all.results.find((p) => p.id === future.id)!.live).toBe(false)
    expect((await get('/api/partners?place=moon')).status).toBe(400)
    expect((await get('/api/partners')).headers.get('Cache-Control')).toContain('public')
  })
})

describe('logos', () => {
  const upload = (id: number, bytes: Uint8Array, type = 'image/png') => {
    const fd = new FormData()
    fd.append('logo', new File([bytes as BlobPart], 'logo', { type }))
    return request(t.env, `/api/admin/partners/${id}/logo`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` }, body: fd })
  }

  it('accepts a clean PNG, serves it publicly, and replaces the old one', async () => {
    const p = await create()
    const first = await parse(await upload(p.id, png(512, 256)), C.adminPartnerResponseSchema, 201)
    const key = first.partner.logo_key!
    expect(key).toMatch(new RegExp(`^photos/partners/${p.id}/.+\\.png$`))
    const served = await request(t.env, `/media/${key}`)
    expect(served.status).toBe(200)
    const second = await parse(await upload(p.id, png(400, 400)), C.adminPartnerResponseSchema, 201)
    expect(second.partner.logo_key).not.toBe(key)
    expect(await t.env.PHOTOS.get(key)).toBeNull()
  })

  it('refuses SVG, metadata, and logos too small or too large', async () => {
    const p = await create()
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')
    expect((await upload(p.id, svg, 'image/svg+xml')).status).toBe(400)
    expect((await upload(p.id, png(512, 512, true))).status).toBe(400)
    expect((await upload(p.id, png(64, 64))).status).toBe(400)
    expect((await upload(p.id, png(2000, 100))).status).toBe(413)
  })
})

describe('supported-by campaigns', () => {
  it('credit the partner on the campaign and count funded repairs automatically', async () => {
    const p = await create()
    const pothole = (await json(await send('POST', '/api/potholes', { lat: 32.88, lng: 13.19, severity: 'severe' }, citizen.token))).id
    expect((await send('POST', '/api/admin/campaigns', { pothole_id: pothole, target_lyd: 300, partner_id: 999 }, admin.token)).status).toBe(404)
    const camp = (await json(await send('POST', '/api/admin/campaigns', { pothole_id: pothole, target_lyd: 300, partner_id: p.id }, admin.token))).campaign
    expect(camp.partner_id).toBe(p.id)

    const shown = await parse(await get(`/api/campaigns/${camp.id}`), C.campaignDetailResponseSchema)
    expect(shown.campaign.partner).toEqual({ id: p.id, name_ar: 'مصرف الجمهورية', name_en: 'Jumhouria Bank', logo_key: null })

    await send('PATCH', `/api/admin/campaigns/${camp.id}`, { status: 'completed', final_cost_lyd: 280 }, admin.token)
    expect((await publicList())[0]).toMatchObject({ funded_count: 1, funded_lyd: 280 })

    // Hidden from campaigns: the campaign no longer names the partner.
    await send('PUT', `/api/admin/partners/${p.id}`, partner({ show_campaigns: false }), admin.token)
    const hidden = await parse(await get(`/api/campaigns/${camp.id}`), C.campaignDetailResponseSchema)
    expect(hidden.campaign.partner).toBeNull()
  })
})
