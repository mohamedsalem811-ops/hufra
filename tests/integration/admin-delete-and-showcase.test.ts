// Integration tests for: admin delete controls (report / photo / region / admin demote),
// self-service change-password, and the public homepage photo showcase
// (fixed + under-repair reports with photos).
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'

let t: TestEnv
const PW = 'Str0ngP@ssw0rd!'

beforeEach(() => {
  t = createTestEnv()
})

async function login(email: string, password = PW) {
  const res = await request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  return { res, body: await json(res) }
}

async function makeUser(email: string, role: 'user' | 'admin' | 'super_admin' = 'user') {
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW, consent: true }),
  })
  if (role !== 'user') await t.db.prepare('UPDATE users SET role = ? WHERE email = ?').bind(role, email).run()
  const { body } = await login(email)
  return body.access_token as string
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' })

async function createReport(lat = 32.8811, lng = 13.3502) {
  const res = await request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat, lng, severity: 'medium', description_ar: 'حفرة' }),
  })
  return (await json(res)).id as number
}

async function addPhoto(potholeId: number, stage: string) {
  const r = await t.db
    .prepare(`INSERT INTO pothole_photos (pothole_id, r2_key, thumb_key, stage) VALUES (?, ?, ?, ?)`)
    .bind(potholeId, `full-${potholeId}-${stage}`, `thumb-${potholeId}-${stage}`, stage)
    .run()
  return r.meta.last_row_id
}

async function setStatus(adminToken: string, id: number, status: string) {
  const res = await request(t.env, `/api/potholes/${id}/status`, {
    method: 'PATCH',
    headers: auth(adminToken),
    body: JSON.stringify({ status }),
  })
  expect(res.status).toBe(200)
}

describe('seeded default super admin login', () => {
  it('admin@hufra.ly / Hufra@Admin2026! logs in as super_admin', async () => {
    const { res, body } = await login('admin@hufra.ly', 'Hufra@Admin2026!')
    expect(res.status).toBe(200)
    expect(body.user.role).toBe('super_admin')
  })
})

describe('DELETE /api/potholes/:id', () => {
  it('is admin-only, hides the report everywhere and clears the showcase cache', async () => {
    const admin = await makeUser('adm@example.com', 'admin')
    const user = await makeUser('usr@example.com')
    const id = await createReport()
    await addPhoto(id, 'report')

    const forbidden = await request(t.env, `/api/potholes/${id}`, { method: 'DELETE', headers: auth(user) })
    expect(forbidden.status).toBe(403)
    const anon = await request(t.env, `/api/potholes/${id}`, { method: 'DELETE' })
    expect(anon.status).toBe(401)

    const ok = await request(t.env, `/api/potholes/${id}`, { method: 'DELETE', headers: auth(admin) })
    expect(ok.status).toBe(200)

    expect((await request(t.env, `/api/potholes/${id}`)).status).toBe(404)
    const list = await json(await request(t.env, '/api/potholes'))
    expect(JSON.stringify(list)).not.toContain(`"id":${id},`)
    const again = await request(t.env, `/api/potholes/${id}`, { method: 'DELETE', headers: auth(admin) })
    expect(again.status).toBe(404)
  })
})

describe('DELETE /api/photos/:id', () => {
  it('soft-deletes one photo, 404s on repeat, rejects non-admins and removes it from the report', async () => {
    const admin = await makeUser('adm2@example.com', 'admin')
    const user = await makeUser('usr2@example.com')
    const id = await createReport()
    const p1 = await addPhoto(id, 'report')
    await addPhoto(id, 'before')

    expect((await request(t.env, `/api/photos/${p1}`, { method: 'DELETE', headers: auth(user) })).status).toBe(403)
    const ok = await request(t.env, `/api/photos/${p1}`, { method: 'DELETE', headers: auth(admin) })
    expect(ok.status).toBe(200)
    expect((await request(t.env, `/api/photos/${p1}`, { method: 'DELETE', headers: auth(admin) })).status).toBe(404)
    expect((await request(t.env, '/api/photos/abc', { method: 'DELETE', headers: auth(admin) })).status).toBe(400)

    const detail = await json(await request(t.env, `/api/potholes/${id}`))
    expect(detail.photos).toHaveLength(1)
    expect(detail.photos[0].stage).toBe('before')

    const audit = await t.db.prepare(`SELECT COUNT(*) as n FROM audit_logs WHERE action = 'photo.delete'`).first<{ n: number }>()
    expect(audit?.n).toBe(1)
  })
})

describe('DELETE /api/regions/:id', () => {
  it('deletes an unused region, refuses one that has reports (409), and is admin-only', async () => {
    const admin = await makeUser('adm3@example.com', 'admin')
    const user = await makeUser('usr3@example.com')

    const created = await request(t.env, '/api/regions', {
      method: 'POST',
      headers: auth(admin),
      body: JSON.stringify({ slug: 'test-zone', name_ar: 'منطقة', name_en: 'Test Zone', center_lat: 32.9, center_lng: 13.2, active: true }),
    })
    const { id: regionId } = await json(created)

    expect((await request(t.env, `/api/regions/${regionId}`, { method: 'DELETE', headers: auth(user) })).status).toBe(403)
    expect((await request(t.env, `/api/regions/${regionId}`, { method: 'DELETE', headers: auth(admin) })).status).toBe(200)
    expect((await request(t.env, `/api/regions/${regionId}`, { method: 'DELETE', headers: auth(admin) })).status).toBe(404)

    // Seeded "tajoura" now has a report -> cannot be deleted
    const reportId = await createReport()
    const detail = await json(await request(t.env, `/api/potholes/${reportId}`))
    const usedRegion = await t.db.prepare('SELECT id FROM regions WHERE slug = ?').bind(detail.pothole.region_slug).first<{ id: number }>()
    const blocked = await request(t.env, `/api/regions/${usedRegion!.id}`, { method: 'DELETE', headers: auth(admin) })
    expect(blocked.status).toBe(409)
  })
})

describe('POST /api/admin/admins/demote', () => {
  it('super_admin can remove admin rights; guards: not self, not last super admin, not a plain user', async () => {
    const superTok = await makeUser('root@example.com', 'super_admin')
    await makeUser('staff@example.com', 'admin')
    await makeUser('plain@example.com')
    const post = (tok: string, email: string) =>
      request(t.env, '/api/admin/admins/demote', { method: 'POST', headers: auth(tok), body: JSON.stringify({ email }) })

    expect((await post(superTok, 'root@example.com')).status).toBe(400) // self
    expect((await post(superTok, 'plain@example.com')).status).toBe(400) // not an admin
    expect((await post(superTok, 'nobody@example.com')).status).toBe(404)

    const ok = await post(superTok, 'staff@example.com')
    expect(ok.status).toBe(200)
    const row = await t.db.prepare('SELECT role FROM users WHERE email = ?').bind('staff@example.com').first<{ role: string }>()
    expect(row?.role).toBe('user')

    // A plain admin can never demote anyone
    const adminTok = await makeUser('staff2@example.com', 'admin')
    expect((await post(adminTok, 'root@example.com')).status).toBe(403)
  })

  it('refuses to demote the last remaining super_admin', async () => {
    const a = await makeUser('sa1@example.com', 'super_admin')
    // Leave exactly two super admins: sa1 and sa2 (retire the seeded default account).
    await t.db.prepare(`UPDATE users SET role = 'user' WHERE email = 'admin@hufra.ly'`).run()
    const b = await makeUser('sa2@example.com', 'super_admin')
    const demote = (tok: string, email: string) =>
      request(t.env, '/api/admin/admins/demote', { method: 'POST', headers: auth(tok), body: JSON.stringify({ email }) })

    expect((await demote(b, 'sa1@example.com')).status).toBe(200) // sa2 is now the only super admin
    // sa1's already-issued access token still says super_admin until it expires (15 min),
    // so it can reach the route - and must be stopped by the last-super-admin guard.
    const blocked = await demote(a, 'sa2@example.com')
    expect(blocked.status).toBe(400)
    expect((await json(blocked)).error).toMatch(/last super admin/i)
    const row = await t.db.prepare('SELECT role FROM users WHERE email = ?').bind('sa2@example.com').first<{ role: string }>()
    expect(row?.role).toBe('super_admin')
  })
})

describe('POST /api/auth/change-password', () => {
  it('requires the current password, enforces length, and the new password works afterwards', async () => {
    const tok = await makeUser('pw@example.com')
    const call = (cur: string, next: string) =>
      request(t.env, '/api/auth/change-password', {
        method: 'POST',
        headers: auth(tok),
        body: JSON.stringify({ current_password: cur, new_password: next }),
      })

    expect((await request(t.env, '/api/auth/change-password', { method: 'POST' })).status).toBe(401)
    expect((await call('wrong-password', 'NewPassw0rd!')).status).toBe(401)
    expect((await call(PW, 'short')).status).toBe(400)
    expect((await call(PW, 'NewPassw0rd!')).status).toBe(200)

    expect((await login('pw@example.com', PW)).res.status).toBe(401)
    expect((await login('pw@example.com', 'NewPassw0rd!')).res.status).toBe(200)
  })
})

describe('GET /api/potholes/showcase', () => {
  it('lists fixed and under-repair reports that have photos, and ignores ones without photos or deleted ones', async () => {
    const admin = await makeUser('adm4@example.com', 'admin')

    const fixedId = await createReport(32.8811, 13.3502)
    await addPhoto(fixedId, 'before')
    await addPhoto(fixedId, 'after')
    await setStatus(admin, fixedId, 'fixed')

    const repairId = await createReport(32.9, 13.2)
    await addPhoto(repairId, 'report')
    await addPhoto(repairId, 'during')
    await setStatus(admin, repairId, 'under_repair')

    const noPhotoId = await createReport(32.85, 13.1)
    await setStatus(admin, noPhotoId, 'under_repair')

    const reportedOnly = await createReport(32.86, 13.15)
    await addPhoto(reportedOnly, 'report')

    const body = await json(await request(t.env, '/api/potholes/showcase'))
    expect(body.fixed.map((r: any) => r.id)).toEqual([fixedId])
    expect(body.fixed[0].before_thumb_key).toBe(`thumb-${fixedId}-before`)
    expect(body.fixed[0].after_thumb_key).toBe(`thumb-${fixedId}-after`)
    expect(body.in_progress.map((r: any) => r.id)).toEqual([repairId])
    expect(body.in_progress[0].before_thumb_key).toBe(`thumb-${repairId}-report`)
    expect(body.in_progress[0].during_thumb_key).toBe(`thumb-${repairId}-during`)
  })

  it('reflects admin deletions immediately (cache is invalidated)', async () => {
    const admin = await makeUser('adm5@example.com', 'admin')
    const id = await createReport()
    const photoId = await addPhoto(id, 'report')
    await setStatus(admin, id, 'under_repair')

    const first = await json(await request(t.env, '/api/potholes/showcase'))
    expect(first.in_progress).toHaveLength(1)

    await request(t.env, `/api/photos/${photoId}`, { method: 'DELETE', headers: auth(admin) })
    const second = await json(await request(t.env, '/api/potholes/showcase'))
    expect(second.in_progress).toHaveLength(0)

    const photo2 = await addPhoto(id, 'during')
    await request(t.env, `/api/photos/${photo2}`, { method: 'DELETE', headers: auth(admin) })
    const id2 = await createReport(32.95, 13.25)
    await addPhoto(id2, 'report')
    await setStatus(admin, id2, 'under_repair')
    expect((await json(await request(t.env, '/api/potholes/showcase'))).in_progress.map((r: any) => r.id)).toEqual([id2])
    await request(t.env, `/api/potholes/${id2}`, { method: 'DELETE', headers: auth(admin) })
    expect((await json(await request(t.env, '/api/potholes/showcase'))).in_progress).toHaveLength(0)
  })
})
