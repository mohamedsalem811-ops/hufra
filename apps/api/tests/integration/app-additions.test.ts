// Plan 7.1: the API additions the app needs - paging, notification
// preferences (honoured by push), the app-version check and shared reports.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import type { z } from 'zod'
import * as C from '@hufra/contracts'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

const PW = 'Str0ngP@ssw0rd!'
const FIX = path.resolve(__dirname, '../fixtures/photos')
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
const report = async (token: string, lat = 32.88) =>
  (await json(await send('POST', '/api/potholes', { lat, lng: 13.19, severity: 'medium', street_ar: 'شارع' }, token))) as { id: number; upload_token: string }

beforeEach(() => {
  t = createTestEnv()
})

describe('paging', () => {
  it('pages my reports newest first with a cursor, without gaps or repeats', async () => {
    const me = await account('me@example.com')
    const ids: number[] = []
    for (let i = 0; i < 5; i++) ids.push((await report(me.token, 32.8 + i / 100)).id)
    const first = await parse(await get('/api/potholes/mine/list?limit=2', me.token), C.myPotholesResponseSchema)
    expect(first.results.map((r) => r.id)).toEqual([ids[4], ids[3]])
    const second = await parse(await get(`/api/potholes/mine/list?limit=2&cursor=${first.next_cursor}`, me.token), C.myPotholesResponseSchema)
    expect(second.results.map((r) => r.id)).toEqual([ids[2], ids[1]])
    const last = await parse(await get(`/api/potholes/mine/list?limit=2&cursor=${second.next_cursor}`, me.token), C.myPotholesResponseSchema)
    expect(last.results.map((r) => r.id)).toEqual([ids[0]])
    expect(last.next_cursor).toBeNull()
    expect((await get('/api/potholes/mine/list?cursor=abc', me.token)).status).toBe(400)
  })

  it('pages the inbox', async () => {
    const me = await account('me@example.com')
    const admin = await account('admin@example.com', 'admin')
    const r = await report(me.token)
    for (const status of ['verified', 'under_repair', 'fixed']) {
      await send('PATCH', `/api/potholes/${r.id}/status`, { status }, admin.token)
    }
    const page1 = await parse(await get('/api/notifications?limit=2', me.token), C.notificationListResponseSchema)
    expect(page1.results).toHaveLength(2)
    expect(page1.unread_count).toBe(3)
    const page2 = await parse(await get(`/api/notifications?limit=2&cursor=${page1.next_cursor}`, me.token), C.notificationListResponseSchema)
    expect(page2.results).toHaveLength(1)
    expect(page2.next_cursor).toBeNull()
  })
})

describe('notification preferences', () => {
  it('are on by default, can be switched off, and then the phone is not alerted (the inbox still is)', async () => {
    const me = await account('me@example.com')
    const admin = await account('admin@example.com', 'admin')
    expect(await parse(await get('/api/notifications/preferences', me.token), C.notificationPreferencesSchema)).toEqual({
      report_updates: true,
      donation_updates: true,
    })
    const off = await parse(await send('PUT', '/api/notifications/preferences', { report_updates: false }, me.token), C.notificationPreferencesSchema)
    expect(off).toEqual({ report_updates: false, donation_updates: true })

    // A device and a push channel, to see whether a push goes out.
    await send('POST', '/api/notifications/push-token', { platform: 'android', token: 'device-token-123456', locale: 'ar' }, me.token)
    const pushed: unknown[] = []
    const realFetch = globalThis.fetch
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      pushed.push([url, init?.body])
      return new Response('{}', { status: 200 })
    }) as typeof fetch
    t.env.PUSH_WEBHOOK_URL = 'https://push.example.test/hook'
    try {
      const r = await report(me.token)
      await send('PATCH', `/api/potholes/${r.id}/status`, { status: 'verified' }, admin.token)
      expect(pushed).toHaveLength(0)
      const inbox = await json(await get('/api/notifications', me.token))
      expect(inbox.results.some((n: any) => n.type === 'status_change')).toBe(true)

      await send('PUT', '/api/notifications/preferences', { report_updates: true }, me.token)
      await send('PATCH', `/api/potholes/${r.id}/status`, { status: 'under_repair' }, admin.token)
      expect(pushed.length).toBeGreaterThan(0)
    } finally {
      globalThis.fetch = realFetch
    }
    expect((await send('PUT', '/api/notifications/preferences', { report_updates: 'yes' }, me.token)).status).toBe(400)
    expect((await get('/api/notifications/preferences')).status).toBe(401)
  })
})

describe('app version check', () => {
  it('says when an update is required or available, as the team sets it', async () => {
    const owner = await account('owner@example.com', 'super_admin')
    const admin = await account('admin@example.com', 'admin')
    const start = await parse(await get('/api/app/version?platform=android&version=1.0.0'), C.appVersionResponseSchema)
    expect(start).toEqual({ latest: '1.0.0', minimum: '1.0.0', update_required: false, update_available: false, store_url: null })

    const settings = {
      ios: { latest: '1.3.0', minimum: '1.0.0', store_url: '' },
      android: { latest: '1.3.0', minimum: '1.2.0', store_url: 'https://play.google.com/store/apps/details?id=ly.tripoli.hufra' },
    }
    expect((await send('PUT', '/api/app/version-settings', settings, admin.token)).status).toBe(403)
    expect((await send('PUT', '/api/app/version-settings', { ...settings, ios: { latest: '1.0.0', minimum: '2.0.0', store_url: '' } }, owner.token)).status).toBe(400)
    expect((await send('PUT', '/api/app/version-settings', settings, owner.token)).status).toBe(200)

    const old = await parse(await get('/api/app/version?platform=android&version=1.1.9'), C.appVersionResponseSchema)
    expect(old).toMatchObject({ update_required: true, update_available: true, store_url: settings.android.store_url })
    const recent = await parse(await get('/api/app/version?platform=android&version=1.2.10'), C.appVersionResponseSchema)
    expect(recent).toMatchObject({ update_required: false, update_available: true })
    const ios = await parse(await get('/api/app/version?platform=ios&version=1.3.0'), C.appVersionResponseSchema)
    expect(ios).toMatchObject({ update_required: false, update_available: false, store_url: null })
    expect((await get('/api/app/version?platform=web&version=1.0.0')).status).toBe(400)
  })
})

describe('shared report', () => {
  it('shows place, status, photos and the campaign, never the reporter', async () => {
    const me = await account('me@example.com')
    const r = await report(me.token)
    const fd = new FormData()
    fd.append('full', new File([fs.readFileSync(path.join(FIX, 'full.jpg'))], 'p', { type: 'image/jpeg' }))
    fd.append('thumb', new File([fs.readFileSync(path.join(FIX, 'thumb.jpg'))], 't', { type: 'image/jpeg' }))
    fd.append('upload_token', r.upload_token)
    await request(t.env, `/api/photos/${r.id}`, { method: 'POST', body: fd })

    const res = await get(`/api/potholes/${r.id}/share`)
    expect(res.headers.get('cache-control')).toBe('public, max-age=300')
    const shared = await parse(res, C.sharedReportResponseSchema)
    expect(shared).toMatchObject({ id: r.id, status: 'reported', street_ar: 'شارع', photo_after: null, campaign: null })
    expect(shared.url).toMatch(new RegExp(`/pothole/${r.id}$`))
    expect(shared.photo_before?.thumb_key).toMatch(/^thumbs\//)
    expect(JSON.stringify(shared)).not.toMatch(/reporter|me@example/)
    expect((await get('/api/potholes/9999/share')).status).toBe(404)
  })
})
