// Plan 7.1 / 8.5: what a shared report link shows. Public and never names the
// reporter: place, status, the before (and after) photo, confirmations and the
// repair campaign.
import type { SharedReport } from '@hufra/contracts'

import type { Bindings } from './types'

export async function loadSharedReport(db: Bindings['DB'], id: number, origin: string): Promise<SharedReport | null> {
  const p = await db
    .prepare(
      `SELECT p.id, p.status, p.severity, p.street_ar, p.street_en, p.created_at, p.fixed_at, p.upvotes_count,
              r.name_ar AS region_name_ar, r.name_en AS region_name_en
       FROM potholes p JOIN regions r ON r.id = p.region_id WHERE p.id = ? AND p.deleted_at IS NULL`
    )
    .bind(id)
    .first<any>()
  if (!p) return null
  const photos = await db
    .prepare(`SELECT stage, thumb_key, r2_key FROM pothole_photos WHERE pothole_id = ? AND deleted_at IS NULL ORDER BY created_at ASC`)
    .bind(id)
    .all<{ stage: string; thumb_key: string; r2_key: string }>()
  const pick = (row?: { thumb_key: string; r2_key: string }) => (row ? { thumb_key: row.thumb_key, r2_key: row.r2_key } : null)
  const before = photos.results.find((ph) => ph.stage === 'before') ?? photos.results.find((ph) => ph.stage === 'report')
  const after = [...photos.results].reverse().find((ph) => ph.stage === 'after')
  const campaign = await db
    .prepare(
      `SELECT c.id, c.status, c.target_millimes,
         COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed'), 0)
         + COALESCE((SELECT SUM(a.amount_millimes) FROM campaign_allocations a WHERE a.to_campaign_id = c.id), 0) AS raised,
         COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'under_review'), 0) AS pending,
         (SELECT COUNT(DISTINCT d.user_id) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed') AS donors
       FROM campaigns c WHERE c.pothole_id = ? AND c.status != 'cancelled' ORDER BY c.id DESC LIMIT 1`
    )
    .bind(id)
    .first<{ id: number; status: string; target_millimes: number; raised: number; pending: number; donors: number }>()
  return {
    id: p.id,
    url: `${origin}/r/${p.id}`,
    status: p.status,
    severity: p.severity,
    street_ar: p.street_ar,
    street_en: p.street_en,
    region_name_ar: p.region_name_ar,
    region_name_en: p.region_name_en,
    created_at: p.created_at,
    fixed_at: p.fixed_at,
    upvotes_count: p.upvotes_count,
    photo_before: pick(before),
    photo_after: pick(after),
    campaign: campaign
      ? {
          id: campaign.id,
          status: campaign.status,
          target_lyd: campaign.target_millimes / 1000,
          confirmed_lyd: campaign.raised / 1000,
          pending_lyd: campaign.pending / 1000,
          donors: campaign.donors,
        }
      : null,
  }
}
