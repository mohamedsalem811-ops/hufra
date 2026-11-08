// Repair campaigns and donations (plan 6.9): the whole bank-transfer journey,
// the money rules (confirmed vs under review, funded, pool), privacy of
// screenshots, abuse limits, and the app -> website sign-in handoff.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const FIX = path.resolve(__dirname, '../fixtures/photos')
const IBAN = 'LY83002048000020100120361'

let t: TestEnv
const H = (token?: string) => ({ 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) })
const get = (p: string, token?: string) => request(t.env, p, { headers: H(token) })
const send = (method: string, p: string, body: unknown, token?: string) =>
  request(t.env, p, { method, headers: H(token), body: JSON.stringify(body) })

async function parse<S extends z.ZodType>(res: Response, schema: S, status = 200): Promise<z.infer<S>> {
  const body = await json(res)
  expect(res.status, JSON.stringify(body)).toBe(status)
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw new Error(`Contract mismatch: ${JSON.stringify(parsed.error.issues)}\n${JSON.stringify(body).slice(0, 500)}`)
  return parsed.data
}

async function account(email: string, role?: 'admin' | 'super_admin', name = 'Test') {
  await send('POST', '/api/auth/register', { email, password: PW, consent: true, display_name: name })
  if (role) await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const body = await json(await send('POST', '/api/auth/login', { email, password: PW }))
  return { token: body.access_token as string, id: body.user.id as number }
}

function proofForm(file = 'full.jpg', type = 'image/jpeg', amount?: string) {
  const fd = new FormData()
  fd.append('proof', new File([fs.readFileSync(path.join(FIX, file))], 'shot', { type }))
  if (amount) fd.append('amount_lyd', amount)
  return fd
}
const upload = (id: number, token: string, fd: FormData) =>
  request(t.env, `/api/donations/${id}/proof`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd })

let superAdmin: { token: string; id: number }
let admin: { token: string; id: number }
let donor: { token: string; id: number }
let potholeId: number

async function openDonations() {
  return send(
    'PUT',
    '/api/admin/settings/donations',
    { enabled: true, account_holder: 'شركة حفرة', bank_name: 'مصرف الجمهورية', iban: 'LY83 0020 4800 0020 1001 2036 1', account_number: '123456789', open_mode_ios: 'in_app', open_mode_android: 'in_app', current_password: PW },
    superAdmin.token
  )
}
async function campaign(target = 300, pid = potholeId) {
  const res = await send('POST', '/api/admin/campaigns', { pothole_id: pid, target_lyd: target, note_ar: 'إصلاح وردم' }, admin.token)
  return (await json(res)).campaign.id as number
}
async function pledge(campaignId: number, amount: number, token = donor.token, show_name = false) {
  return parse(await send('POST', `/api/campaigns/${campaignId}/donations`, { amount_lyd: amount, show_name }, token), C.createDonationResponseSchema, 201)
}
const review = (id: number, body: unknown) => send('POST', `/api/admin/donations/${id}/review`, body, admin.token)

beforeEach(async () => {
  t = createTestEnv()
  superAdmin = await account('owner@example.com', 'super_admin')
  admin = await account('team@example.com', 'admin')
  donor = await account('donor@example.com', undefined, 'سالم')
  const created = await json(await send('POST', '/api/potholes', { lat: 32.8811, lng: 13.3502, severity: 'severe', street_ar: 'شارع الجمهورية' }, donor.token))
  potholeId = created.id
})

describe('settings', () => {
  it('stays closed until a super admin fills in valid bank details', async () => {
    const config = await parse(await get('/api/donations/config'), C.donationConfigResponseSchema)
    expect(config.enabled).toBe(false)
    const id = await campaign()
    expect((await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 10 }, donor.token)).status).toBe(503)

    // Admins (not super admins) cannot change where the money goes.
    expect((await send('PUT', '/api/admin/settings/donations', {}, admin.token)).status).toBe(403)
    const badIban = await send(
      'PUT',
      '/api/admin/settings/donations',
      { enabled: true, account_holder: 'x', bank_name: 'y', iban: 'LY84002048000020100120361', account_number: '', open_mode_ios: 'in_app', open_mode_android: 'in_app', current_password: PW },
      superAdmin.token
    )
    expect(badIban.status).toBe(400)
    expect((await json(badIban)).error_ar).toBe('رقم IBAN غير صحيح')

    expect((await openDonations()).status).toBe(200)
    const open = await parse(await get('/api/donations/config'), C.donationConfigResponseSchema)
    expect(open).toEqual({ enabled: true, open_mode: { ios: 'in_app', android: 'in_app' }, methods: { bank_transfer: true, card_moamalat: false } })
    // Every admin is told when the bank details change.
    const inbox = await json(await get('/api/notifications', admin.token))
    expect(inbox.results.some((n: any) => n.type === 'payout_changed')).toBe(true)
  })

  it('lets the team send iPhone users to Safari without a new app build', async () => {
    await openDonations()
    await send(
      'PUT',
      '/api/admin/settings/donations',
      { enabled: true, account_holder: 'شركة حفرة', bank_name: 'مصرف الجمهورية', iban: IBAN, account_number: '', open_mode_ios: 'safari', open_mode_android: 'in_app', current_password: PW },
      superAdmin.token
    )
    const config = await parse(await get('/api/donations/config'), C.donationConfigResponseSchema)
    expect(config.open_mode).toEqual({ ios: 'safari', android: 'in_app' })
  })
})

describe('bank transfer journey', () => {
  it('pledge -> screenshot -> review -> confirmed; the bar counts only confirmed money', async () => {
    await openDonations()
    const id = await campaign(300)

    const { donation, bank } = await pledge(id, 50, donor.token, true)
    expect(donation.reference_code).toMatch(/^HF-[2-9A-HJKMNP-Z]{6}$/)
    expect(donation.status).toBe('awaiting_transfer')
    expect(donation.expires_at).not.toBeNull()
    expect(bank).toEqual({ account_holder: 'شركة حفرة', bank_name: 'مصرف الجمهورية', iban: IBAN, account_number: '123456789' })

    // A pledge alone moves nothing.
    let detail = await parse(await get(`/api/campaigns/${id}`), C.campaignDetailResponseSchema)
    expect(detail.campaign).toMatchObject({ target_lyd: 300, confirmed_lyd: 0, under_review_lyd: 0 })

    // Screenshot, with the amount actually sent: under review, shown apart.
    const up = await parse(await upload(donation.id, donor.token, proofForm('full.jpg', 'image/jpeg', '55.5')), C.donationDetailResponseSchema.pick({ donation: true }))
    expect(up.donation).toMatchObject({ status: 'under_review', amount_lyd: 55.5, has_proof: true, expires_at: null })
    detail = await parse(await get(`/api/campaigns/${id}`), C.campaignDetailResponseSchema)
    expect(detail.campaign).toMatchObject({ confirmed_lyd: 0, under_review_lyd: 55.5 })

    // The team sees it in the queue with the private screenshot link.
    const queue = await json(await get('/api/admin/donations', admin.token))
    expect(queue.results).toHaveLength(1)
    expect(queue.results[0].proof_url).toBe(`/api/donations/${donation.id}/proof`)
    expect(queue.results[0].donor.email).toBe('donor@example.com')

    expect((await review(donation.id, { decision: 'confirm' })).status).toBe(200)
    detail = await parse(await get(`/api/campaigns/${id}`), C.campaignDetailResponseSchema)
    expect(detail.campaign).toMatchObject({ confirmed_lyd: 55.5, under_review_lyd: 0, donors_count: 1, status: 'active' })
    expect(detail.donors).toEqual([{ name: 'سالم', amount_lyd: 55.5, confirmed_at: expect.any(String) }])

    const mine = await parse(await get('/api/donations/mine', donor.token), C.myDonationsResponseSchema)
    expect(mine.results[0]).toMatchObject({ status: 'confirmed', street_ar: 'شارع الجمهورية', pothole_id: potholeId })
    // The donor is told, in their language, and the tap opens the report.
    const inbox = await json(await get('/api/notifications', donor.token))
    const note = inbox.results.find((n: any) => n.type === 'donation_confirmed')
    expect(JSON.parse(note.payload_json)).toMatchObject({ url: `/pothole/${potholeId}`, body_ar: expect.stringContaining('55.5 د.ل') })
  })

  it('keeps anonymous donors anonymous on the wall', async () => {
    await openDonations()
    const id = await campaign(300)
    const { donation } = await pledge(id, 20)
    await upload(donation.id, donor.token, proofForm())
    await review(donation.id, { decision: 'confirm' })
    const detail = await parse(await get(`/api/campaigns/${id}`), C.campaignDetailResponseSchema)
    expect(detail.donors[0].name).toBeNull()
  })

  it('marks a campaign funded when confirmed money reaches the cost, then stops taking pledges', async () => {
    await openDonations()
    const id = await campaign(100)
    const { donation } = await pledge(id, 100)
    await upload(donation.id, donor.token, proofForm())
    const res = await json(await review(donation.id, { decision: 'confirm' }))
    expect(res.campaign_funded).toBe(true)
    const detail = await parse(await get(`/api/campaigns/${id}`), C.campaignDetailResponseSchema)
    expect(detail.campaign.status).toBe('funded')
    expect(detail.campaign.funded_at).not.toBeNull()
    expect((await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 5 }, donor.token)).status).toBe(409)
  })

  it('rejects with a reason the donor can read', async () => {
    await openDonations()
    const id = await campaign()
    const { donation } = await pledge(id, 30)
    await upload(donation.id, donor.token, proofForm())
    expect((await review(donation.id, { decision: 'reject' })).status).toBe(400)
    expect((await review(donation.id, { decision: 'reject', reason: 'لم يصل التحويل' })).status).toBe(200)
    const mine = await parse(await get(`/api/donations/${donation.id}`, donor.token), C.donationDetailResponseSchema)
    expect(mine.donation).toMatchObject({ status: 'rejected', reject_reason: 'لم يصل التحويل' })
    expect(mine.bank).toBeNull()
    // Deciding twice is refused.
    expect((await review(donation.id, { decision: 'confirm' })).status).toBe(409)
  })
})

describe('protection', () => {
  it('keeps screenshots private to the donor and the team', async () => {
    await openDonations()
    const id = await campaign()
    const { donation } = await pledge(id, 10)
    await upload(donation.id, donor.token, proofForm())
    const other = await account('other@example.com')
    expect((await get(`/api/donations/${donation.id}/proof`)).status).toBe(401)
    expect((await get(`/api/donations/${donation.id}/proof`, other.token)).status).toBe(404)
    expect((await get(`/api/donations/${donation.id}`, other.token)).status).toBe(404)
    const own = await get(`/api/donations/${donation.id}/proof`, donor.token)
    expect(own.status).toBe(200)
    expect(own.headers.get('cache-control')).toBe('private, no-store')
    expect((await get(`/api/donations/${donation.id}/proof`, admin.token)).status).toBe(200)
    // Never through the public media route.
    const key = (await t.db.prepare('SELECT proof_key FROM donations WHERE id = ?').bind(donation.id).first<any>()).proof_key
    expect(key).toMatch(/^proofs\//)
    expect((await get(`/media/${key}`)).status).toBe(400)
  })

  it('refuses the same screenshot for two donations', async () => {
    await openDonations()
    const id = await campaign()
    const a = await pledge(id, 10)
    const b = await pledge(id, 10)
    expect((await upload(a.donation.id, donor.token, proofForm())).status).toBe(200)
    const dup = await upload(b.donation.id, donor.token, proofForm())
    expect(dup.status).toBe(409)
    expect((await json(dup)).error_ar).toBe('هذه الصورة استُخدمت لتبرع آخر')
    expect((await upload(b.donation.id, donor.token, proofForm('full.webp', 'image/webp'))).status).toBe(200)
  })

  it('refuses images that were not compressed (EXIF, wrong type)', async () => {
    await openDonations()
    const id = await campaign()
    const { donation } = await pledge(id, 10)
    const fd = new FormData()
    fd.append('proof', new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], 'x.png', { type: 'image/png' }))
    expect((await upload(donation.id, donor.token, fd)).status).toBe(400)
  })

  it('limits open pledges and amounts', async () => {
    await openDonations()
    const id = await campaign()
    expect((await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 0.5 }, donor.token)).status).toBe(400)
    expect((await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 200000 }, donor.token)).status).toBe(400)
    expect((await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 10 })).status).toBe(401)
    for (let i = 0; i < 3; i++) await pledge(id, 10)
    const fourth = await send('POST', `/api/campaigns/${id}/donations`, { amount_lyd: 10 }, donor.token)
    expect(fourth.status).toBe(409)
    // Cancelling one frees a slot.
    const mine = await json(await get('/api/donations/mine', donor.token))
    expect((await send('POST', `/api/donations/${mine.results[0].id}/cancel`, {}, donor.token)).status).toBe(200)
    await pledge(id, 10)
  })

  it('expires pledges without a screenshot after 48 hours', async () => {
    await openDonations()
    const id = await campaign()
    const { donation } = await pledge(id, 10)
    await t.db.prepare(`UPDATE donations SET expires_at = '2000-01-01T00:00:00.000Z' WHERE id = ?`).bind(donation.id).run()
    const mine = await parse(await get('/api/donations/mine', donor.token), C.myDonationsResponseSchema)
    expect(mine.results[0].status).toBe('expired')
    expect((await upload(donation.id, donor.token, proofForm())).status).toBe(409)
  })

  it('allows one open campaign per report, and admins only', async () => {
    await campaign()
    expect((await send('POST', '/api/admin/campaigns', { pothole_id: potholeId, target_lyd: 50 }, admin.token)).status).toBe(409)
    expect((await send('POST', '/api/admin/campaigns', { pothole_id: potholeId, target_lyd: 50 }, donor.token)).status).toBe(403)
  })
})

describe('leftover money and the pool', () => {
  it('moves surplus and cancelled money into the pool, then into a new campaign', async () => {
    await openDonations()
    const first = await campaign(100)
    const a = await pledge(first, 150)
    await upload(a.donation.id, donor.token, proofForm())
    await review(a.donation.id, { decision: 'confirm' })
    // Completed: 150 raised for a 100 repair leaves 50 in the pool.
    let res = await json(await send('PATCH', `/api/admin/campaigns/${first}`, { status: 'completed' }, admin.token))
    expect(res.pool_lyd).toBe(50)

    const p2 = (await json(await send('POST', '/api/potholes', { lat: 32.9, lng: 13.2, severity: 'medium' }, donor.token))).id
    const second = await campaign(200, p2)
    const b = await pledge(second, 30)
    await upload(b.donation.id, donor.token, proofForm('full.webp', 'image/webp'))
    await review(b.donation.id, { decision: 'confirm' })
    // Cancelling needs a reason; all 30 then goes to the pool.
    expect((await send('PATCH', `/api/admin/campaigns/${second}`, { status: 'cancelled' }, admin.token)).status).toBe(400)
    res = await json(await send('PATCH', `/api/admin/campaigns/${second}`, { status: 'cancelled', reason: 'أصلحتها البلدية' }, admin.token))
    expect(res.pool_lyd).toBe(80)

    const p3 = (await json(await send('POST', '/api/potholes', { lat: 32.91, lng: 13.21, severity: 'minor' }, donor.token))).id
    const third = await campaign(80, p3)
    expect((await send('POST', `/api/admin/campaigns/${third}/allocate`, { amount_lyd: 81 }, admin.token)).status).toBe(409)
    res = await json(await send('POST', `/api/admin/campaigns/${third}/allocate`, { amount_lyd: 80, note: 'من الحملات السابقة' }, admin.token))
    expect(res.pool_lyd).toBe(0)
    expect(res.campaign).toMatchObject({ confirmed_lyd: 80, status: 'funded' })
  })
})

describe('app -> website handoff', () => {
  it('opens the website signed in, once, and only for our own pages', async () => {
    expect((await send('POST', '/api/auth/web-handoff', { next: 'https://evil.example' }, donor.token)).status).toBe(400)
    const made = await parse(await send('POST', '/api/auth/web-handoff', { next: '/donate/1' }, donor.token), C.webHandoffResponseSchema)
    expect(made.expires_in).toBe(60)
    const url = new URL(made.url)
    const first = await request(t.env, url.pathname + url.search, { redirect: 'manual' })
    expect(first.status).toBe(302)
    expect(first.headers.get('location')).toBe('/donate/1')
    expect(first.headers.get('set-cookie')).toContain('hufra_session=')
    // Used once: a second visit goes to the normal sign-in page.
    const again = await request(t.env, url.pathname + url.search, { redirect: 'manual' })
    expect(again.headers.get('location')).toBe('/login')
    expect(again.headers.get('set-cookie') ?? '').not.toContain('hufra_session=')
  })

  it('expires after 60 seconds and is never offered to admins', async () => {
    const made = await json(await send('POST', '/api/auth/web-handoff', { next: '/donate/1' }, donor.token))
    await t.db.prepare(`UPDATE web_handoff_tokens SET expires_at = '2000-01-01T00:00:00.000Z'`).run()
    const url = new URL(made.url)
    expect((await request(t.env, url.pathname + url.search, { redirect: 'manual' })).headers.get('location')).toBe('/login')
    expect((await send('POST', '/api/auth/web-handoff', { next: '/donate/1' }, admin.token)).status).toBe(403)
  })
})

describe('data export', () => {
  it('includes my donations', async () => {
    await openDonations()
    const id = await campaign()
    await pledge(id, 12.5)
    const data = await json(await get('/api/auth/me/export', donor.token))
    expect(data.donations).toHaveLength(1)
    expect(data.donations[0]).toMatchObject({ amount_lyd: 12.5, status: 'awaiting_transfer' })
  })
})

describe('reading campaigns', () => {
  it('lists open campaigns and finds the one for a report', async () => {
    expect(await parse(await get(`/api/campaigns/by-pothole/${potholeId}`), C.potholeCampaignResponseSchema)).toEqual({ campaign: null })
    const id = await campaign(250)
    const list = await parse(await get('/api/campaigns'), C.campaignListResponseSchema)
    expect(list.results.map((c) => c.id)).toEqual([id])
    const byReport = await parse(await get(`/api/campaigns/by-pothole/${potholeId}`), C.potholeCampaignResponseSchema)
    expect(byReport.campaign).toMatchObject({ id, target_lyd: 250, status: 'active', street_ar: 'شارع الجمهورية', note_ar: 'إصلاح وردم' })
    // A cancelled campaign is not shown on the report.
    await send('PATCH', `/api/admin/campaigns/${id}`, { status: 'cancelled', reason: 'test' }, admin.token)
    expect((await json(await get(`/api/campaigns/by-pothole/${potholeId}`))).campaign).toBeNull()
    expect((await get('/api/campaigns/abc')).status).toBe(400)
    expect((await get('/api/campaigns/999')).status).toBe(404)
  })

  it('lets the team raise or lower the cost (funded status follows)', async () => {
    await openDonations()
    const id = await campaign(100)
    const { donation } = await pledge(id, 60)
    await upload(donation.id, donor.token, proofForm())
    await review(donation.id, { decision: 'confirm' })
    let res = await json(await send('PATCH', `/api/admin/campaigns/${id}`, { target_lyd: 50 }, admin.token))
    expect(res.campaign.status).toBe('funded')
    res = await json(await send('PATCH', `/api/admin/campaigns/${id}`, { target_lyd: 120 }, admin.token))
    expect(res.campaign.status).toBe('active')
    const all = await json(await get('/api/admin/campaigns?status=active', admin.token))
    expect(all.results[0]).toMatchObject({ id, target_lyd: 120, confirmed_lyd: 60 })
  })
})
