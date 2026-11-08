// Plan 8.2: bank-details password, general rules, contact details, versioned
// legal information with per-user acceptance, and the audit log viewer.
import { describe, it, expect, beforeEach } from 'vitest'
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

let owner: { token: string; id: number }
let admin: { token: string; id: number }
let citizen: { token: string; id: number }
beforeEach(async () => {
  t = createTestEnv()
  owner = await account('owner@hufra.ly', 'super_admin')
  admin = await account('team@hufra.ly', 'admin')
  citizen = await account('citizen@hufra.ly')
})

const bank = { enabled: false, account_holder: 'شركة حفرة', bank_name: 'مصرف الجمهورية', iban: 'LY83002048000020100120361', account_number: '', open_mode_ios: 'in_app', open_mode_android: 'in_app' }

describe('bank details need the password', () => {
  it('refuses a change without the right password and saves nothing', async () => {
    expect((await send('PUT', '/api/admin/settings/donations', bank, owner.token)).status).toBe(403)
    const wrong = await send('PUT', '/api/admin/settings/donations', { ...bank, current_password: 'nope' }, owner.token)
    expect(wrong.status).toBe(403)
    expect((await json(wrong)).error_ar).toBe('أدخل كلمة مرورك لتغيير بيانات الحساب')
    const now = await parse(await get('/api/admin/settings/donations', owner.token), C.donationSettingsResponseSchema)
    expect(now.settings.iban).toBe('')
  })

  it('saves with it, keeps it out of the audit log, and needs no password for the switches', async () => {
    await parse(await send('PUT', '/api/admin/settings/donations', { ...bank, current_password: PW }, owner.token), C.donationSettingsResponseSchema)
    const audit = await t.db.prepare(`SELECT after_json FROM audit_logs WHERE action = 'settings.donations'`).first<{ after_json: string }>()
    expect(audit!.after_json).not.toContain(PW)
    expect(audit!.after_json).toContain('LY83002048000020100120361')
    const toggled = await parse(await send('PUT', '/api/admin/settings/donations', { ...bank, open_mode_ios: 'safari' }, owner.token), C.donationSettingsResponseSchema)
    expect(toggled.settings.open_mode_ios).toBe('safari')
  })
})

describe('general rules', () => {
  it('start from the defaults and only a super admin changes them', async () => {
    expect((await parse(await get('/api/admin/settings/rules', admin.token), C.generalRulesResponseSchema)).rules).toEqual(C.GENERAL_RULE_DEFAULTS)
    const rules = { duplicate_radius_m: 10, pending_hours: 24, large_lyd: 200 }
    expect((await send('PUT', '/api/admin/settings/rules', rules, admin.token)).status).toBe(403)
    expect((await send('PUT', '/api/admin/settings/rules', { ...rules, pending_hours: 0 }, owner.token)).status).toBe(400)
    expect((await parse(await send('PUT', '/api/admin/settings/rules', rules, owner.token), C.generalRulesResponseSchema)).rules).toEqual(rules)
  })

  it('change how close two reports must be to be flagged as duplicates', async () => {
    await send('PUT', '/api/admin/settings/rules', { duplicate_radius_m: 10, pending_hours: 48, large_lyd: 500 }, owner.token)
    const report = (lat: number) => send('POST', '/api/potholes', { lat, lng: 13.3502, severity: 'medium' }, citizen.token)
    await report(32.8811)
    await report(32.88128) // about 20 m away: more than 10 m
    const dups = await json(await get('/api/admin/duplicates', admin.token))
    expect(dups.results).toHaveLength(0)
  })
})

describe('contact details', () => {
  it('are public, and any admin keeps them current', async () => {
    expect((await parse(await get('/api/site/contact'), C.contactResponseSchema)).contact).toEqual({ public_email: '', privacy_email: '', phone: '', social_links: [] })
    const contact = { public_email: 'Info@Hufra.ly', privacy_email: 'privacy@hufra.ly', phone: '+218 91 000 0000', social_links: ['https://facebook.com/hufra'] }
    expect((await send('PUT', '/api/admin/settings/contact', contact, citizen.token)).status).toBe(403)
    expect((await send('PUT', '/api/admin/settings/contact', { ...contact, social_links: ['http://x.ly'] }, admin.token)).status).toBe(400)
    expect((await send('PUT', '/api/admin/settings/contact', { ...contact, public_email: 'nope' }, admin.token)).status).toBe(400)
    await send('PUT', '/api/admin/settings/contact', contact, admin.token)
    const res = await get('/api/site/contact')
    expect(res.headers.get('Cache-Control')).toContain('public')
    expect((await json(res)).contact).toEqual({ ...contact, public_email: 'info@hufra.ly' })
  })
})

describe('legal information', () => {
  const full = {
    legal_name_ar: 'شركة حفرة للخدمات', legal_name_en: 'HUFRA Services', registration_no: '12345', address: 'طرابلس، ليبيا', courts: 'طرابلس',
    retention_financial_years: 10, retention_screenshots_days: 90, wrong_transfer_days: 14, privacy_reply_days: 30,
  }

  it('is "being prepared" until published with every required field', async () => {
    const empty = await parse(await get('/api/site/legal'), C.legalResponseSchema)
    expect(empty).toMatchObject({ version: 0, complete: false, acceptance_required_from: 0, published_at: null })
    const partial = await parse(await send('PUT', '/api/admin/settings/legal', { ...full, address: '', material: false }, owner.token), C.legalResponseSchema)
    expect(partial).toMatchObject({ version: 1, complete: false })
    const done = await parse(await send('PUT', '/api/admin/settings/legal', { ...full, material: false }, owner.token), C.legalResponseSchema)
    expect(done).toMatchObject({ version: 2, complete: true, acceptance_required_from: 0 })
    expect((await send('PUT', '/api/admin/settings/legal', { ...full, material: false }, admin.token)).status).toBe(403)
  })

  it('asks users to accept a material change, and records who accepted which version', async () => {
    await send('PUT', '/api/admin/settings/legal', { ...full, material: true }, owner.token)
    await send('PUT', '/api/admin/settings/legal', { ...full, address: 'طرابلس', material: false }, owner.token)
    const legal = await parse(await get('/api/site/legal'), C.legalResponseSchema)
    expect(legal).toMatchObject({ version: 2, acceptance_required_from: 1 })

    let me = await parse(await get('/api/auth/me', citizen.token), C.meResponseSchema)
    expect(me.user.legal_version_accepted).toBeNull()
    expect((await send('POST', '/api/auth/me/accept-legal', { version: 9 }, citizen.token)).status).toBe(404)
    expect((await send('POST', '/api/auth/me/accept-legal', { version: 2 }, citizen.token)).status).toBe(200)
    // Accepting an older version never lowers what was accepted.
    await send('POST', '/api/auth/me/accept-legal', { version: 1 }, citizen.token)
    me = await parse(await get('/api/auth/me', citizen.token), C.meResponseSchema)
    expect(me.user.legal_version_accepted).toBe(2)

    const inbox = await json(await get('/api/notifications', admin.token))
    expect(inbox.results.some((n: any) => n.type === 'legal_published')).toBe(true)
  })
})

describe('audit log', () => {
  it('filters by action and pages by cursor', async () => {
    for (let i = 0; i < 3; i++) await send('PUT', '/api/admin/settings/contact', { public_email: '', privacy_email: '', phone: String(i), social_links: [] }, admin.token)
    await send('PUT', '/api/admin/settings/rules', { duplicate_radius_m: 60, pending_hours: 48, large_lyd: 500 }, owner.token)

    const page1 = await parse(await get('/api/admin/audit-logs?action=settings.contact&limit=2', owner.token), C.auditLogResponseSchema)
    expect(page1.results).toHaveLength(2)
    expect(page1.results[0]).toMatchObject({ action: 'settings.contact', actor_name: 'team@hufra.ly', after: { phone: '2' } })
    const page2 = await parse(await get(`/api/admin/audit-logs?action=settings.contact&limit=2&cursor=${page1.next_cursor}`, owner.token), C.auditLogResponseSchema)
    expect(page2.results.map((r) => (r.after as any).phone)).toEqual(['0'])
    expect(page2.next_cursor).toBeNull()

    const settings = await parse(await get('/api/admin/audit-logs?action=settings', owner.token), C.auditLogResponseSchema)
    expect(settings.results).toHaveLength(4)
    expect((await get('/api/admin/audit-logs?action=DROP TABLE', owner.token)).status).toBe(400)
    expect((await get('/api/admin/audit-logs', admin.token)).status).toBe(403)
  })
})
