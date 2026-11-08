// Plan 8.2e: admin accounts (roles, regions, suspension, last sign-in),
// regions with their workload, and the donor ranking.
import {
  adminAccountListResponseSchema,
  adminAccountResponseSchema,
  adminRegionListResponseSchema,
  topDonorsResponseSchema,
} from '@hufra/contracts'
import { beforeEach, describe, expect, it } from 'vitest'

import { createTestEnv, json, request, type TestEnv } from './helpers/test-env'

let t: TestEnv
const PW = 'Str0ngP@ssw0rd!'
const H = { 'Content-Type': 'application/json' }

beforeEach(() => {
  t = createTestEnv()
})

const login = (email: string) => request(t.env, '/api/auth/login', { method: 'POST', headers: H, body: JSON.stringify({ email, password: PW }) })

async function makeUser(email: string, role: 'user' | 'admin' | 'super_admin' = 'user') {
  await request(t.env, '/api/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ email, password: PW, consent: true }) })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const body = await json(await login(email))
  return { token: body.access_token as string, refresh: body.refresh_token as string, id: body.user.id as number }
}

const auth = (token: string) => ({ ...H, Authorization: `Bearer ${token}` })
const get = (token: string, path: string) => request(t.env, path, { headers: auth(token) })
const send = (token: string, path: string, method: string, body: unknown) => request(t.env, path, { method, headers: auth(token), body: JSON.stringify(body) })
const count = async (sql: string, ...binds: unknown[]) => (await t.db.prepare(sql).bind(...binds).first<{ n: number }>())!.n
const regionIds = async () => (await t.db.prepare('SELECT id FROM regions ORDER BY id LIMIT 3').all<{ id: number }>()).results.map((r) => r.id)

describe('admin accounts', () => {
  it('lists admins with regions, last sign-in and suspension; super admins only', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    const [r1, r2] = await regionIds()

    expect((await get(staff.token, '/api/admin/admins')).status).toBe(403)

    const set = await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { region_ids: [r1, r2, r1] })
    expect(set.status).toBe(200)
    const { admin } = adminAccountResponseSchema.parse(await json(set))
    expect(admin.regions.map((r) => r.id).sort()).toEqual([r1, r2].sort())

    const list = adminAccountListResponseSchema.parse(await json(await get(owner.token, '/api/admin/admins')))
    const mine = list.results.filter((a) => a.email.endsWith('@example.com'))
    expect(mine.map((a) => a.email)).toEqual(['owner@example.com', 'staff@example.com']) // super admins first
    expect(mine[0]!.regions).toEqual([])
    expect(mine[0]!.last_login_at).not.toBeNull()
    expect(mine[1]!.suspended).toBe(false)
  })

  it('promotes an existing account with regions, and refuses unknown ones', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    await makeUser('citizen@example.com')
    const [r1] = await regionIds()

    const missing = await send(owner.token, '/api/admin/admins/promote', 'POST', { email: 'nobody@example.com', role: 'admin' })
    expect(missing.status).toBe(404)
    expect((await json(missing)).error_ar).toMatch(/إنشاء حساب/)
    expect((await send(owner.token, '/api/admin/admins/promote', 'POST', { email: 'citizen@example.com', role: 'admin', region_ids: [99999] })).status).toBe(400)

    const ok = await send(owner.token, '/api/admin/admins/promote', 'POST', { email: 'citizen@example.com', role: 'admin', region_ids: [r1] })
    expect(ok.status).toBe(200)
    expect((await json(ok)).admin.regions.map((r: { id: number }) => r.id)).toEqual([r1])
    const audit = await t.db.prepare(`SELECT after_json FROM audit_logs WHERE action = 'user.promote'`).first<{ after_json: string }>()
    expect(JSON.parse(audit!.after_json)).toEqual({ role: 'admin', region_ids: [r1] })
  })

  it('suspends an admin: sessions end, sign-in and refresh are refused, reinstating restores them', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')

    const res = await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { suspended: true })
    expect(res.status).toBe(200)
    expect((await json(res)).admin.suspended).toBe(true)

    const refresh = await request(t.env, '/api/auth/refresh', { method: 'POST', headers: H, body: JSON.stringify({ refresh_token: staff.refresh }) })
    expect(refresh.status).toBe(401)
    const signIn = await login('staff@example.com')
    expect(signIn.status).toBe(403)
    expect((await json(signIn)).error_ar).toMatch(/موقوف/)
    expect(await count(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'user.suspend'`)).toBe(1)

    expect((await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { suspended: false })).status).toBe(200)
    expect((await login('staff@example.com')).status).toBe(200)
    expect(await count(`SELECT COUNT(*) AS n FROM audit_logs WHERE action = 'user.reinstate'`)).toBe(1)
  })

  it('never lets the super admins lock themselves out', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const other = await makeUser('other@example.com', 'super_admin')

    // Own account: no role change, no suspension.
    expect((await send(owner.token, `/api/admin/admins/${owner.id}`, 'PUT', { suspended: true })).status).toBe(400)
    expect((await send(owner.token, `/api/admin/admins/${owner.id}`, 'PUT', { role: 'admin' })).status).toBe(400)
    expect((await send(owner.token, '/api/admin/admins/promote', 'POST', { email: 'owner@example.com', role: 'admin' })).status).toBe(400)

    // Suspending the other super admin leaves the owner as the last active one...
    expect((await send(owner.token, `/api/admin/admins/${other.id}`, 'PUT', { suspended: true })).status).toBe(200)
    // ...so the suspended one cannot be counted on: a third super admin cannot remove the owner.
    const third = await makeUser('third@example.com', 'super_admin')
    expect((await send(third.token, `/api/admin/admins/${owner.id}`, 'PUT', { role: 'admin' })).status).toBe(200)
    const last = await send(owner.token, `/api/admin/admins/${third.id}`, 'PUT', { role: 'admin' })
    expect(last.status).toBe(403) // the owner is an admin now: the change applies at once, not when the token expires
    // With the seeded owner gone, the third is the only active super admin; it still cannot suspend itself.
    await t.db.prepare(`UPDATE users SET role = 'user' WHERE email = 'admin@hufra.ly'`).run()
    const lastOne = await send(third.token, `/api/admin/admins/${third.id}`, 'PUT', { suspended: true })
    expect(lastOne.status).toBe(400)
    await t.db.prepare(`UPDATE users SET suspended_at = NULL WHERE id = ?`).bind(other.id).run()
    expect((await send(third.token, `/api/admin/admins/${other.id}`, 'PUT', { suspended: true })).status).toBe(200)
    expect((await send(third.token, `/api/admin/admins/${third.id}`, 'PUT', { role: 'admin' })).status).toBe(400) // still self
  })

  it('a suspended admin is signed out at once, even with a fresh token', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    expect((await get(staff.token, '/api/admin/queue')).status).toBe(200)
    await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { suspended: true })
    expect((await get(staff.token, '/api/admin/queue')).status).toBe(401)
  })

  it('a super admin has no regions, and demoting clears regions and suspension', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    const [r1] = await regionIds()
    await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { region_ids: [r1], suspended: true })

    const up = await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { role: 'super_admin', region_ids: [r1] })
    expect((await json(up)).admin.regions).toEqual([])
    await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { role: 'admin', region_ids: [r1] })

    expect((await send(owner.token, '/api/admin/admins/demote', 'POST', { email: 'staff@example.com' })).status).toBe(200)
    const row = await t.db.prepare('SELECT role, suspended_at FROM users WHERE id = ?').bind(staff.id).first<{ role: string; suspended_at: string | null }>()
    expect(row).toEqual({ role: 'user', suspended_at: null })
    expect(await count('SELECT COUNT(*) AS n FROM admin_regions WHERE user_id = ?', staff.id)).toBe(0)
    expect((await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { suspended: false })).status).toBe(404)
  })

  it('rejects empty or malformed changes', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    expect((await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', {})).status).toBe(400)
    expect((await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { role: 'user' })).status).toBe(400)
    expect((await send(owner.token, '/api/admin/admins/abc', 'PUT', { suspended: true })).status).toBe(400)
  })
})

describe('regions with workload', () => {
  it('counts open and total reports and active assigned admins', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    const away = await makeUser('away@example.com', 'admin')
    const [r1, r2] = await regionIds()
    await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { region_ids: [r1] })
    await send(owner.token, `/api/admin/admins/${away.id}`, 'PUT', { region_ids: [r1, r2], suspended: true })
    for (const status of ['reported', 'verified', 'fixed']) {
      await t.db.prepare('INSERT INTO potholes (region_id, lat, lng, status) VALUES (?, 32.88, 13.19, ?)').bind(r1, status).run()
    }
    await t.db.prepare(`INSERT INTO potholes (region_id, lat, lng, deleted_at) VALUES (?, 32.88, 13.19, '2026-01-01')`).bind(r1).run()
    await t.db.prepare('UPDATE regions SET active = 0 WHERE id = ?').bind(r2).run()

    expect((await request(t.env, '/api/admin/regions')).status).toBe(401)
    const body = adminRegionListResponseSchema.parse(await json(await get(staff.token, '/api/admin/regions')))
    const one = body.results.find((r) => r.id === r1)!
    expect(one).toMatchObject({ open_reports: 2, total_reports: 3, admin_count: 1 })
    expect(body.results.find((r) => r.id === r2)).toMatchObject({ active: 0, admin_count: 0 })
    expect(body.results.at(-1)!.active).toBe(0) // inactive regions last
  })

  it('deleting a region with no reports also drops its admin assignments', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const staff = await makeUser('staff@example.com', 'admin')
    const [r1] = await regionIds()
    await send(owner.token, `/api/admin/admins/${staff.id}`, 'PUT', { region_ids: [r1] })
    expect((await request(t.env, `/api/regions/${r1}`, { method: 'DELETE', headers: auth(owner.token) })).status).toBe(200)
    expect(await count('SELECT COUNT(*) AS n FROM admin_regions')).toBe(0)
  })
})

describe('top donors', () => {
  it('ranks confirmed transfers per person with recorded cash gifts, names only when shown', async () => {
    const owner = await makeUser('owner@example.com', 'super_admin')
    const shy = await makeUser('shy@example.com')
    const proud = await makeUser('proud@example.com')
    await t.db.prepare(`UPDATE users SET display_name = 'سالم' WHERE id = ?`).bind(proud.id).run()
    await t.db.prepare(`UPDATE users SET display_name = 'خفي' WHERE id = ?`).bind(shy.id).run()
    const pothole = (await t.db.prepare('INSERT INTO potholes (region_id, lat, lng) VALUES (1, 32.88, 13.19)').run()).meta.last_row_id
    const campaign = (await t.db.prepare('INSERT INTO campaigns (pothole_id, target_millimes) VALUES (?, 9000000)').bind(pothole).run()).meta.last_row_id
    let ref = 0
    const give = (user: number, millimes: number, status: string, show = 0) =>
      t.db
        .prepare('INSERT INTO donations (campaign_id, user_id, reference_code, amount_millimes, status, show_name) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(campaign, user, `HUF-T${++ref}`, millimes, status, show)
        .run()
    await give(proud.id, 50000, 'confirmed', 1)
    await give(proud.id, 30000, 'confirmed', 0)
    await give(shy.id, 120000, 'confirmed', 0)
    await give(shy.id, 900000, 'rejected', 0)
    await request(t.env, '/api/donors', { method: 'POST', headers: auth(owner.token), body: JSON.stringify({ name: 'مكتب الحي', amount_lyd: 100.5 }) })

    const body = topDonorsResponseSchema.parse(await json(await get(owner.token, '/api/admin/top-donors')))
    expect(body.results).toEqual([
      { name: null, cash: false, amount_millimes: 120000, donations: 1 },
      { name: 'مكتب الحي', cash: true, amount_millimes: 100500, donations: 1 },
      { name: 'سالم', cash: false, amount_millimes: 80000, donations: 2 },
    ])
  })
})
