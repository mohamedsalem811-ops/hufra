// Lifecycle rules for PATCH /api/potholes/:id/status.
import { describe, it, expect, beforeEach } from 'vitest'
import { createTestEnv, request, json, type TestEnv } from './helpers/test-env'
import { planStatusChange } from '../../src/routes/potholes'

let t: TestEnv
let admin: string

beforeEach(async () => {
  t = createTestEnv()
  await request(t.env, '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adm@example.com', password: 'Str0ngP@ssw0rd!', consent: true }),
  })
  await t.db.prepare(`UPDATE users SET role = 'admin' WHERE email = 'adm@example.com'`).run()
  const login = await request(t.env, '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'adm@example.com', password: 'Str0ngP@ssw0rd!' }),
  })
  admin = (await json(login)).access_token
})

async function report() {
  const res = await request(t.env, '/api/potholes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 32.8811, lng: 13.3502, severity: 'severe' }),
  })
  return (await json(res)).id as number
}

const move = (id: number, status: string, note?: string) =>
  request(t.env, `/api/potholes/${id}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${admin}` },
    body: JSON.stringify({ status, note }),
  })

const row = (id: number) => t.db.prepare('SELECT * FROM potholes WHERE id = ?').bind(id).first<any>()
const historyCount = async (id: number) =>
  (await t.db.prepare('SELECT COUNT(*) AS n FROM status_history WHERE pothole_id = ?').bind(id).first<{ n: number }>())!.n

describe('status change rules', () => {
  it('setting the same status again is refused and does not reset the repair date', async () => {
    const id = await report()
    await move(id, 'fixed')
    const fixedAt = (await row(id)).fixed_at
    await new Promise((r) => setTimeout(r, 5))
    const again = await move(id, 'fixed')
    expect(again.status).toBe(409)
    expect((await row(id)).fixed_at).toBe(fixedAt)
    expect(await historyCount(id)).toBe(2) // reported + fixed, no extra row
  })

  it('allows moving forward, including skipping a stage', async () => {
    const id = await report()
    expect((await move(id, 'fixed')).status).toBe(200)
    const r = await row(id)
    expect(r.status).toBe('fixed')
    expect(r.fixed_at).toBeTruthy()
    expect(r.verified_at).toBeNull()
  })

  it('moving backward needs a reason', async () => {
    const id = await report()
    await move(id, 'fixed')
    const noReason = await move(id, 'reported')
    expect(noReason.status).toBe(400)
    expect((await json(noReason)).error).toMatch(/reason/)
    expect((await move(id, 'reported', 'ok')).status).toBe(400) // too short
    expect((await row(id)).status).toBe('fixed')
  })

  it('reopening with a reason clears the undone stages and keeps the history', async () => {
    const id = await report()
    for (const s of ['verified', 'under_repair', 'fixed']) await move(id, s)
    const res = await move(id, 'under_repair', 'Asphalt cracked again after the rain')
    expect(res.status).toBe(200)
    expect(await json(res)).toMatchObject({ status: 'under_repair', previous_status: 'fixed' })
    const r = await row(id)
    expect(r.fixed_at).toBeNull()
    expect(r.under_repair_at).toBeTruthy()
    expect(r.verified_at).toBeTruthy()

    const last = await t.db
      .prepare('SELECT from_status, to_status, note FROM status_history WHERE pothole_id = ? ORDER BY id DESC LIMIT 1')
      .bind(id)
      .first()
    expect(last).toEqual({ from_status: 'fixed', to_status: 'under_repair', note: 'Asphalt cracked again after the rain' })

    // A reopened report no longer counts towards the average fix time.
    const counters = await json(await request(t.env, '/api/potholes/counters'))
    expect(counters.avg_response_days).toBeNull()
  })

  it('a change based on an outdated view is refused (two admins at once)', async () => {
    const id = await report()
    // Make the route's read return "reported", then let admin A's change land
    // before the route writes - exactly the race between two admins.
    const realPrepare = t.db.prepare.bind(t.db)
    let raced = false
    ;(t.env.DB as any).prepare = (sql: string) => {
      const stmt = realPrepare(sql)
      if (!raced && sql.startsWith('SELECT * FROM potholes WHERE id = ?')) {
        const bind = stmt.bind.bind(stmt)
        ;(stmt as any).bind = (...args: unknown[]) => {
          const bound = bind(...args)
          const first = bound.first.bind(bound)
          ;(bound as any).first = async () => {
            const seen = await first()
            raced = true
            await realPrepare(`UPDATE potholes SET status = 'verified' WHERE id = ?`).bind(id).run() // admin A
            return seen
          }
          return bound
        }
      }
      return stmt
    }

    const res = await move(id, 'fixed') // admin B, planned from the stale "reported"
    expect(res.status).toBe(409)
    expect((await json(res)).error).toMatch(/changed by someone else/)
    expect((await row(id)).status).toBe('verified') // A's change was not overwritten
  })

  it('no history row and no stale staging row are left behind by a refused change', async () => {
    const id = await report()
    await move(id, 'verified')
    await move(id, 'verified') // refused
    await move(id, 'reported') // refused, no reason
    const staged = await t.db.prepare('SELECT COUNT(*) AS n FROM pending_status_change').first<{ n: number }>()
    expect(staged!.n).toBe(0)
    expect(await historyCount(id)).toBe(2)
  })

  it('returning to a stage that was skipped gives it a start date', async () => {
    const id = await report()
    await move(id, 'fixed') // skipped "under repair"
    await move(id, 'under_repair', 'Cracked again after rain')
    const r = await row(id)
    expect(r.under_repair_at).toBeTruthy()
    expect(r.fixed_at).toBeNull()
  })

  it('refuses invalid ids', async () => {
    expect((await move(0, 'verified')).status).toBe(400)
  })
})

describe('planStatusChange', () => {
  it('sets only the target timestamp going forward and clears later ones going back', () => {
    expect(planStatusChange('reported', 'under_repair', undefined)).toEqual({ ok: true, set: ['under_repair_at'], clear: [], ensure: [] })
    expect(planStatusChange('fixed', 'reported', 'Was reported in error')).toEqual({
      ok: true,
      set: [],
      clear: ['verified_at', 'under_repair_at', 'fixed_at'],
      ensure: [],
    })
    expect(planStatusChange('fixed', 'under_repair', 'Cracked again')).toMatchObject({ clear: ['fixed_at'], ensure: ['under_repair_at'] })
    expect(planStatusChange('verified', 'verified', undefined)).toMatchObject({ ok: false, status: 409 })
  })
})
