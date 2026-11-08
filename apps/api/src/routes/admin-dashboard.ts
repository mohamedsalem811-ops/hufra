// Admin panel, plan 8.2g: the dashboard numbers and the CSV export of reports.
import { dashboardQuerySchema, reportQueueQuerySchema } from '@hufra/contracts'
import { Hono } from 'hono'
import { z } from 'zod'

import { recordAudit } from '../lib/audit'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'
import { csvCell, csvResponse } from '../lib/csv'
import { queueWhere } from './admin-reports'

const dashboard = new Hono<{ Bindings: Bindings }>()
dashboard.use('/dashboard', attachAuth, requireRole('admin', 'super_admin'))
dashboard.use('/export/*', attachAuth, requireRole('admin', 'super_admin'))

const DAY_MS = 24 * 60 * 60 * 1000
const WEEKS = 12
/** ISO time n days before `now`, in the same format SQLite stores. */
const ago = (now: number, days: number) => new Date(now - days * DAY_MS).toISOString()
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)
const RAISED = `COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed'), 0)
  + COALESCE((SELECT SUM(a.amount_millimes) FROM campaign_allocations a WHERE a.to_campaign_id = c.id), 0)`
const FIX_DAYS = `julianday(p.fixed_at) - julianday(p.created_at)`

dashboard.get('/dashboard', async (c) => {
  const parsed = dashboardQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid query', error_ar: 'معايير بحث غير صحيحة' }, 400)
  const days = parsed.data.days
  const now = Date.now()
  const from = ago(now, days)
  const before = ago(now, days * 2)
  const staleBefore = ago(now, 3)
  const weeksFrom = ago(now, WEEKS * 7)
  const db = c.env.DB

  const [tiles, weekly, byStatus, campaigns, todo, byRegion] = await db.batch([
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM potholes WHERE deleted_at IS NULL AND created_at >= ?) AS new_reports,
           (SELECT COUNT(*) FROM potholes WHERE deleted_at IS NULL AND created_at >= ? AND created_at < ?) AS new_reports_previous,
           (SELECT COUNT(*) FROM potholes WHERE deleted_at IS NULL AND status = 'reported') AS awaiting_verification,
           (SELECT MIN(created_at) FROM potholes WHERE deleted_at IS NULL AND status = 'reported') AS oldest_waiting_at,
           (SELECT COUNT(*) FROM potholes WHERE deleted_at IS NULL AND status = 'under_repair') AS under_repair,
           (SELECT COUNT(DISTINCT region_id) FROM potholes WHERE deleted_at IS NULL AND status = 'under_repair') AS under_repair_regions,
           (SELECT COUNT(*) FROM potholes p WHERE p.deleted_at IS NULL AND p.status = 'fixed' AND p.fixed_at >= ?) AS fixed,
           (SELECT AVG(${FIX_DAYS}) FROM potholes p WHERE p.deleted_at IS NULL AND p.status = 'fixed' AND p.fixed_at >= ?) AS avg_fix_days,
           (SELECT COALESCE(SUM(amount_millimes), 0) FROM donations WHERE status = 'confirmed' AND COALESCE(reviewed_at, updated_at) >= ?) AS confirmed_millimes,
           (SELECT COALESCE(SUM(amount_millimes), 0) FROM donations WHERE status = 'under_review') AS under_review_millimes`
      )
      .bind(from, before, from, from, from, from),
    db
      .prepare(
        `SELECT CAST((julianday(?) - julianday(created_at)) / 7 AS INTEGER) AS w, COUNT(*) AS n
         FROM potholes WHERE deleted_at IS NULL AND created_at >= ? GROUP BY w`
      )
      .bind(new Date(now).toISOString(), weeksFrom),
    db.prepare(`SELECT status, COUNT(*) AS n FROM potholes WHERE deleted_at IS NULL GROUP BY status`),
    db.prepare(
      `SELECT COUNT(*) AS open, COALESCE(SUM(MAX(c.target_millimes - (${RAISED}), 0)), 0) AS missing_millimes
       FROM campaigns c WHERE c.status IN ('active', 'funded')`
    ),
    db
      .prepare(
        `SELECT
           (SELECT COUNT(*) FROM potholes WHERE deleted_at IS NULL AND status = 'reported' AND created_at < ?) AS stale_reports,
           (SELECT COUNT(*) FROM donations WHERE status = 'under_review') AS donations_to_review,
           (SELECT COUNT(*) FROM campaigns WHERE status = 'funded') AS funded_campaigns,
           (SELECT COUNT(*) FROM duplicate_flags df
              JOIN potholes n ON n.id = df.pothole_id AND n.deleted_at IS NULL
              JOIN potholes o ON o.id = df.duplicate_of_id AND o.deleted_at IS NULL
              WHERE df.review_status = 'pending') AS duplicates`
      )
      .bind(staleBefore),
    db
      .prepare(
        `SELECT r.id, r.name_ar, r.name_en,
           SUM(CASE WHEN p.status != 'fixed' THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN p.status = 'fixed' AND p.fixed_at >= ? THEN 1 ELSE 0 END) AS fixed,
           AVG(CASE WHEN p.status = 'fixed' AND p.fixed_at >= ? THEN ${FIX_DAYS} END) AS avg_fix_days
         FROM regions r JOIN potholes p ON p.region_id = r.id AND p.deleted_at IS NULL
         GROUP BY r.id
         HAVING open > 0 OR fixed > 0
         ORDER BY open DESC, fixed DESC, r.name_ar ASC
         LIMIT 30`
      )
      .bind(from, from),
  ])

  const t = tiles.results[0] as Record<string, any>
  const perWeek = new Map((weekly.results as { w: number; n: number }[]).map((r) => [r.w, r.n]))
  const status = Object.fromEntries((byStatus.results as { status: string; n: number }[]).map((r) => [r.status, r.n]))
  const camp = campaigns.results[0] as { open: number; missing_millimes: number }

  c.header('Cache-Control', 'private, no-store')
  return c.json({
    days,
    tiles: {
      new_reports: t.new_reports,
      new_reports_previous: t.new_reports_previous,
      awaiting_verification: t.awaiting_verification,
      oldest_waiting_at: t.oldest_waiting_at,
      under_repair: t.under_repair,
      under_repair_regions: t.under_repair_regions,
      fixed: t.fixed,
      avg_fix_days: round1(t.avg_fix_days),
      confirmed_lyd: t.confirmed_millimes / 1000,
      under_review_lyd: t.under_review_millimes / 1000,
    },
    // Rolling weeks ending now: index 0 is 12 weeks ago, the last one is the past 7 days.
    weekly: Array.from({ length: WEEKS }, (_, i) => {
      const w = WEEKS - 1 - i
      return { week_start: ago(now, w * 7 + 7).slice(0, 10), count: perWeek.get(w) ?? 0 }
    }),
    by_status: { reported: status.reported ?? 0, verified: status.verified ?? 0, under_repair: status.under_repair ?? 0, fixed: status.fixed ?? 0 },
    campaigns: { open: camp.open, missing_lyd: camp.missing_millimes / 1000 },
    todo: todo.results[0],
    by_region: (byRegion.results as Record<string, any>[]).map((r) => ({ ...r, avg_fix_days: round1(r.avg_fix_days) })),
  })
})

// ---------------------------------------------------------------- CSV

const exportQuerySchema = reportQueueQuerySchema.extend({
  /** Only reports made in the last N days (the dashboard's period). */
  days: z.coerce.number().int().min(1).max(3660).optional(),
})

const COLUMNS = [
  'id', 'created_at', 'status', 'severity', 'region_ar', 'region_en', 'street_ar', 'street_en', 'lat', 'lng',
  'confirmations', 'verified_at', 'under_repair_at', 'fixed_at', 'days_to_fix', 'link',
] as const
const MAX_ROWS = 10000

// Reports as a spreadsheet, with the queue's filters. Never who reported them.
dashboard.get('/export/reports.csv', async (c) => {
  const parsed = exportQuerySchema.safeParse(c.req.query())
  if (!parsed.success) return c.json({ error: 'Invalid query', error_ar: 'معايير بحث غير صحيحة' }, 400)
  const { whereSql, binds } = queueWhere(parsed.data)
  const where = parsed.data.days ? `${whereSql} AND p.created_at >= ?` : whereSql
  if (parsed.data.days) binds.push(ago(Date.now(), parsed.data.days))
  const origin = new URL(c.req.url).origin

  const rows = await c.env.DB.prepare(
    `SELECT p.id, p.created_at, p.status, p.severity, r.name_ar AS region_ar, r.name_en AS region_en, p.street_ar, p.street_en,
       p.lat, p.lng, p.upvotes_count AS confirmations, p.verified_at, p.under_repair_at, p.fixed_at,
       CASE WHEN p.fixed_at IS NOT NULL THEN ROUND(${FIX_DAYS}, 1) END AS days_to_fix
     FROM potholes p JOIN regions r ON r.id = p.region_id
     WHERE ${where}
     ORDER BY p.created_at DESC, p.id DESC
     LIMIT ${MAX_ROWS}`
  )
    .bind(...binds)
    .all<Record<string, unknown>>()

  const lines = [COLUMNS.join(','), ...rows.results.map((r) => COLUMNS.map((k) => csvCell(k === 'link' ? `${origin}/pothole/${r.id}` : r[k])).join(','))]
  await recordAudit(c.env.DB, {
    actorId: c.get('auth')!.userId,
    action: 'export.reports',
    entity: 'potholes',
    entityId: null,
    after: { rows: rows.results.length, filters: Object.fromEntries(Object.entries(c.req.query()).filter(([k]) => k !== 'page' && k !== 'page_size')) },
  })
  return csvResponse(lines, 'hufra-reports', 'private, no-store')
})

export default dashboard
