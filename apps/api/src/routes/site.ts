// Plan 8.2: public site information read by the website and the app.
import { Hono } from 'hono'

import { cachedJson } from '../lib/cache'
import { deferFrom } from '../lib/notifications'
import { loadContact, loadLegal } from '../lib/site-settings'
import type { Bindings } from '../lib/types'

const site = new Hono<{ Bindings: Bindings }>()

// Changes show within five minutes everywhere, with no new release.
site.get('/contact', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json({ contact: await loadContact(c.env.DB) })
})

site.get('/legal', async (c) => {
  c.header('Cache-Control', 'public, max-age=300')
  return c.json(await loadLegal(c.env.DB))
})

const MONTHS = 6
const round1 = (n: number | null) => (n === null ? null : Math.round(n * 10) / 10)
const FIX_DAYS = 'julianday(p.fixed_at) - julianday(p.created_at)'

/** The months shown, oldest first, as "YYYY-MM" (UTC). */
export function lastMonths(now: Date, n = MONTHS): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (n - 1 - i), 1))
    return d.toISOString().slice(0, 7)
  })
}

// The website's public figures. Anonymous, cached for a minute.
site.get('/numbers', async (c) => {
  const payload = await cachedJson(
    'site_numbers:v1',
    async () => {
      const db = c.env.DB
      const months = lastMonths(new Date())
      const [totals, money, monthly, regions] = await db.batch([
        db.prepare(
          `SELECT COUNT(*) AS reports,
             COALESCE(SUM(CASE WHEN p.status = 'fixed' THEN 1 ELSE 0 END), 0) AS fixed,
             AVG(CASE WHEN p.status = 'fixed' AND p.fixed_at IS NOT NULL THEN ${FIX_DAYS} END) AS avg_fix_days
           FROM potholes p WHERE p.deleted_at IS NULL`
        ),
        db.prepare(
          `SELECT
             (SELECT COALESCE(SUM(amount_millimes), 0) FROM donations WHERE status = 'confirmed') AS confirmed,
             (SELECT COALESCE(SUM(final_cost_millimes), 0) FROM campaigns WHERE status = 'completed') AS spent,
             (SELECT COALESCE(SUM(d.amount_millimes), 0) FROM donations d JOIN campaigns c ON c.id = d.campaign_id
                WHERE d.status = 'confirmed' AND c.status IN ('active', 'funded'))
             + (SELECT COALESCE(SUM(a.amount_millimes), 0) FROM campaign_allocations a JOIN campaigns c ON c.id = a.to_campaign_id
                WHERE c.status IN ('active', 'funded')) AS in_open,
             (SELECT COALESCE(SUM(amount_millimes), 0) FROM campaign_allocations) AS moved`
        ),
        db
          .prepare(
            `SELECT substr(fixed_at, 1, 7) AS month, COUNT(*) AS n FROM potholes
             WHERE deleted_at IS NULL AND status = 'fixed' AND fixed_at >= ? GROUP BY month`
          )
          .bind(`${months[0]}-01`),
        db.prepare(
          `SELECT r.id, r.name_ar, r.name_en, COUNT(p.id) AS reports,
             COALESCE(SUM(CASE WHEN p.status = 'fixed' THEN 1 ELSE 0 END), 0) AS fixed,
             AVG(CASE WHEN p.status = 'fixed' AND p.fixed_at IS NOT NULL THEN ${FIX_DAYS} END) AS avg_fix_days
           FROM regions r JOIN potholes p ON p.region_id = r.id AND p.deleted_at IS NULL
           GROUP BY r.id ORDER BY reports DESC, r.name_ar ASC`
        ),
      ])
      const t = totals.results[0] as { reports: number; fixed: number; avg_fix_days: number | null }
      const m = money.results[0] as { confirmed: number; spent: number; in_open: number; moved: number }
      const perMonth = new Map((monthly.results as { month: string; n: number }[]).map((r) => [r.month, r.n]))
      return {
        reports: t.reports,
        fixed: t.fixed,
        open: t.reports - t.fixed,
        avg_fix_days: round1(t.avg_fix_days),
        confirmed_lyd: m.confirmed / 1000,
        spent_lyd: m.spent / 1000,
        in_open_campaigns_lyd: m.in_open / 1000,
        moved_lyd: m.moved / 1000,
        monthly_fixed: months.map((month) => ({ month, count: perMonth.get(month) ?? 0 })),
        by_region: (regions.results as Record<string, any>[]).map((r) => ({ ...r, avg_fix_days: round1(r.avg_fix_days) })),
        updated_at: new Date().toISOString(),
      }
    },
    deferFrom(c)
  )
  c.header('Cache-Control', 'public, max-age=60')
  return c.json(payload)
})

export default site
