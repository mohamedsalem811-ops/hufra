// Plan 8.2: campaign cost breakdown, final cost and receipt, and the
// donation review queue's warnings and tab counts.
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
    { enabled: true, account_holder: 'شركة حفرة', bank_name: 'مصرف الجمهورية', iban: 'LY83 0020 4800 0020 1001 2036 1', account_number: '123456789', open_mode_ios: 'in_app', open_mode_android: 'in_app' },
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
  await openDonations()
})

const receiptForm = (file = 'full.jpg', type = 'image/jpeg') => {
  const fd = new FormData()
  fd.append('receipt', new File([fs.readFileSync(path.join(FIX, file))], 'r', { type }))
  return fd
}

describe('campaign cost breakdown', () => {
  it('stores the items when they add up to the target', async () => {
    const items = [{ label: 'مواد (أسفلت، ردم)', amount_lyd: 700 }, { label: 'أجرة العمال', amount_lyd: 500.5 }]
    const res = await parse(
      await send('POST', '/api/admin/campaigns', { pothole_id: potholeId, target_lyd: 1200.5, cost_items: items, contractor: 'فريق الصيانة' }, admin.token),
      C.adminCampaignResponseSchema,
      201
    )
    expect(res.campaign).toMatchObject({ target_lyd: 1200.5, cost_items: items, contractor: 'فريق الصيانة', final_cost_lyd: null, receipt_key: null })
    const bad = await send('POST', '/api/admin/campaigns', { pothole_id: potholeId, target_lyd: 1000, cost_items: items }, admin.token)
    expect(bad.status).toBe(400)
  })

  it('moves the target with a new breakdown, and reopens funding if it grows', async () => {
    const id = await campaign(100)
    const p = await pledge(id, 100)
    await upload(p.donation.id, donor.token, proofForm())
    await review(p.donation.id, { decision: 'confirm' })
    const list = await parse(await get('/api/admin/campaigns', admin.token), C.adminCampaignListResponseSchema)
    expect(list.results[0]!.status).toBe('funded')

    const res = await parse(
      await send('PATCH', `/api/admin/campaigns/${id}`, { cost_items: [{ label: 'مواد', amount_lyd: 150 }, { label: 'عمال', amount_lyd: 50 }] }, admin.token),
      C.adminCampaignResponseSchema
    )
    expect(res.campaign).toMatchObject({ target_lyd: 200, status: 'active' })
  })
})

describe('completing a campaign', () => {
  it('publishes the final cost and the receipt photo', async () => {
    const id = await campaign(300)
    expect((await send('PATCH', `/api/admin/campaigns/${id}`, { final_cost_lyd: 280 }, admin.token)).status).toBe(400)
    const done = await parse(await send('PATCH', `/api/admin/campaigns/${id}`, { status: 'completed', final_cost_lyd: 280 }, admin.token), C.adminCampaignResponseSchema)
    expect(done.campaign).toMatchObject({ status: 'completed', final_cost_lyd: 280 })

    // After completion only the published facts can change.
    expect((await send('PATCH', `/api/admin/campaigns/${id}`, { final_cost_lyd: 290, contractor: 'شركة الطرق' }, admin.token)).status).toBe(200)
    expect((await send('PATCH', `/api/admin/campaigns/${id}`, { target_lyd: 900 }, admin.token)).status).toBe(409)

    const up = await parse(
      await request(t.env, `/api/admin/campaigns/${id}/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` }, body: receiptForm() }),
      C.adminCampaignResponseSchema,
      201
    )
    const key = up.campaign.receipt_key!
    expect(key).toMatch(new RegExp(`^photos/receipts/${id}/`))
    expect((await request(t.env, `/media/${key}`)).status).toBe(200)

    // A new receipt replaces the old one.
    const again = await parse(
      await request(t.env, `/api/admin/campaigns/${id}/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${admin.token}` }, body: receiptForm('full.webp', 'image/webp') }),
      C.adminCampaignResponseSchema,
      201
    )
    expect(again.campaign.receipt_key).not.toBe(key)
    expect(await t.env.PHOTOS.get(key)).toBeNull()

    const audit = await t.db.prepare(`SELECT action FROM audit_logs WHERE entity = 'campaigns' AND entity_id = ? ORDER BY id`).bind(id).all<{ action: string }>()
    expect(audit.results.map((r) => r.action)).toEqual(expect.arrayContaining(['campaign.completed', 'campaign.receipt']))
  })

  it('refuses a receipt for a cancelled campaign, a missing file and non-staff', async () => {
    const id = await campaign(300)
    const post = (token: string, body: FormData) => request(t.env, `/api/admin/campaigns/${id}/receipt`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body })
    expect((await post(donor.token, receiptForm())).status).toBe(403)
    expect((await post(admin.token, new FormData())).status).toBe(400)
    await send('PATCH', `/api/admin/campaigns/${id}`, { status: 'cancelled', reason: 'أصلحتها البلدية' }, admin.token)
    expect((await post(admin.token, receiptForm())).status).toBe(409)
  })
})

describe('donation review queue', () => {
  it('counts each tab and warns about what needs a closer look', async () => {
    const id = await campaign(5000)
    const big = await pledge(id, 600)
    await upload(big.donation.id, donor.token, proofForm('full.jpg', 'image/jpeg', '650'))
    const small = await pledge(id, 20)
    await upload(small.donation.id, donor.token, proofForm('full.webp', 'image/webp'))
    await pledge(id, 10) // awaiting the screenshot
    const rejected = await pledge(id, 30)
    await t.db.prepare(`UPDATE donations SET status = 'rejected' WHERE id = ?`).bind(rejected.donation.id).run()

    const queue = await parse(await get('/api/admin/donations', admin.token), C.adminDonationListResponseSchema)
    expect(queue.counts).toEqual({ under_review: 2, awaiting_transfer: 1, confirmed: 0, rejected: 1 })
    const byId = Object.fromEntries(queue.results.map((d) => [d.id, d]))
    expect(byId[big.donation.id]!.warnings.sort()).toEqual(['amount_changed', 'earlier_rejections', 'large_amount'])
    expect(byId[small.donation.id]!.warnings).toEqual(['earlier_rejections'])
    expect(byId[big.donation.id]!.proof_uploaded_at).toBeTruthy()
    expect(byId[big.donation.id]!.donor).toMatchObject({ email: 'donor@example.com', name: 'سالم' })
  })

  it('warns when the same donor has another donation of the same amount waiting', async () => {
    const id = await campaign(5000)
    const a = await pledge(id, 50)
    await upload(a.donation.id, donor.token, proofForm())
    const b = await pledge(id, 50)
    await upload(b.donation.id, donor.token, proofForm('full.webp', 'image/webp'))
    const queue = await parse(await get('/api/admin/donations', admin.token), C.adminDonationListResponseSchema)
    expect(queue.results.every((d) => d.warnings.includes('same_amount_pending'))).toBe(true)

    const done = await parse(await review(a.donation.id, { decision: 'confirm' }), C.adminDonationReviewResponseSchema)
    expect(done.donation.status).toBe('confirmed')
    const after = await parse(await get('/api/admin/donations', admin.token), C.adminDonationListResponseSchema)
    expect(after.results[0]!.warnings).not.toContain('same_amount_pending')
  })
})
