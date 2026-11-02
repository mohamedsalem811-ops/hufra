import { createDonationSchema, DONATION_LIMITS, lydToMillimes } from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import {
  bankDetails,
  bankTransferReady,
  DONATION_SQL,
  expireStalePledges,
  getCampaignRow,
  listCampaignRows,
  loadDonationSettings,
  newReferenceCode,
  pledgeExpiry,
  toCampaignSummary,
  toDonation,
  type DonationRow,
} from '../lib/donations'
import { checkRateLimit } from '../lib/rate-limit'
import type { Bindings } from '../lib/types'
import { attachAuth, requireAuth } from '../middleware/auth'

// Repair campaigns: public reading, and starting a donation (signed in).
const campaigns = new Hono<{ Bindings: Bindings }>()
campaigns.use('*', attachAuth)

const bad = (c: any, status: 400 | 404 | 409 | 429 | 503, error: string, error_ar: string) => c.json({ error, error_ar }, status)
const idParam = (raw: string | undefined) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** How many open pledges (no screenshot yet) one person may hold at once. */
const MAX_OPEN_PLEDGES = 3
const DONATION_LIMIT_PER_HOUR = 6

// GET /api/campaigns - open campaigns (active first, then funded), newest first.
campaigns.get('/', async (c) => {
  const rows = await listCampaignRows(c.env.DB, `WHERE c.status IN ('active', 'funded')`, [], 50)
  rows.sort((a, b) => (a.status === b.status ? 0 : a.status === 'active' ? -1 : 1))
  return c.json({ results: rows.map(toCampaignSummary) })
})

// GET /api/campaigns/by-pothole/:potholeId - the report's open campaign, else its latest one.
campaigns.get('/by-pothole/:potholeId', async (c) => {
  const potholeId = idParam(c.req.param('potholeId'))
  if (!potholeId) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const rows = await listCampaignRows(
    c.env.DB,
    `WHERE c.pothole_id = ? AND c.status != 'cancelled'`,
    [potholeId],
    5
  )
  const open = rows.find((r) => r.status === 'active' || r.status === 'funded') ?? rows[0] ?? null
  return c.json({ campaign: open ? toCampaignSummary(open) : null })
})

// GET /api/campaigns/:id - one campaign with its public donor wall.
campaigns.get('/:id', async (c) => {
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const row = await getCampaignRow(c.env.DB, id)
  if (!row) return bad(c, 404, 'Not found', 'غير موجود')
  // Names only for donors who chose to show them; amounts are public either way.
  const donors = await c.env.DB.prepare(
    `SELECT CASE WHEN d.show_name = 1 THEN COALESCE(NULLIF(TRIM(u.display_name), ''), u.code) END AS name,
            d.amount_millimes, COALESCE(d.reviewed_at, d.created_at) AS confirmed_at
     FROM donations d JOIN users u ON u.id = d.user_id
     WHERE d.campaign_id = ? AND d.status = 'confirmed' AND u.deleted_at IS NULL
     ORDER BY d.reviewed_at DESC LIMIT 50`
  )
    .bind(id)
    .all<{ name: string | null; amount_millimes: number; confirmed_at: string }>()
  return c.json({
    campaign: toCampaignSummary(row),
    donors: donors.results.map((d) => ({ name: d.name, amount_lyd: d.amount_millimes / 1000, confirmed_at: d.confirmed_at })),
  })
})

// POST /api/campaigns/:id/donations - start a donation (bank transfer pledge).
campaigns.post('/:id/donations', requireAuth(), async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')

  const parsed = createDonationSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    return bad(c, 400, `Amount must be between ${DONATION_LIMITS.minLyd} and ${DONATION_LIMITS.maxLyd} LYD`, `المبلغ بين ${DONATION_LIMITS.minLyd} و${DONATION_LIMITS.maxLyd} د.ل`)
  }
  // Counted after validation: only real attempts use up the hourly allowance.
  const rl = await checkRateLimit(c.env, 'donate', String(auth.userId), DONATION_LIMIT_PER_HOUR, 3600)
  if (!rl.allowed) return bad(c, 429, 'Too many donations started, try again later', 'محاولات تبرع كثيرة، حاول لاحقاً')
  if (parsed.data.method !== 'bank_transfer') {
    return bad(c, 409, 'Card payments are not available yet', 'الدفع بالبطاقة غير متاح بعد')
  }

  const settings = await loadDonationSettings(c.env.DB)
  if (!bankTransferReady(settings)) return bad(c, 503, 'Donations are not open yet', 'التبرعات غير متاحة بعد')

  const campaign = await getCampaignRow(c.env.DB, id)
  if (!campaign) return bad(c, 404, 'Not found', 'غير موجود')
  if (campaign.status !== 'active') return bad(c, 409, 'This campaign is not taking donations', 'هذه الحملة لا تستقبل تبرعات')

  await expireStalePledges(c.env.DB)
  const open = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM donations WHERE user_id = ? AND status = 'awaiting_transfer'`)
    .bind(auth.userId)
    .first<{ n: number }>()
  if ((open?.n ?? 0) >= MAX_OPEN_PLEDGES) {
    return bad(c, 409, 'Finish or cancel your open donations first', 'أكمل تبرعاتك المفتوحة أو ألغها أولاً')
  }

  // Reference codes are random; retry on the (rare) clash.
  let donationId: number | null = null
  for (let attempt = 0; attempt < 5 && donationId === null; attempt++) {
    try {
      const res = await c.env.DB.prepare(
        `INSERT INTO donations (campaign_id, user_id, reference_code, method, amount_millimes, show_name, expires_at)
         VALUES (?, ?, ?, 'bank_transfer', ?, ?, ?)`
      )
        .bind(id, auth.userId, newReferenceCode(), lydToMillimes(parsed.data.amount_lyd), parsed.data.show_name ? 1 : 0, pledgeExpiry())
        .run()
      donationId = Number(res.meta.last_row_id)
    } catch (err) {
      if (!String(err).includes('UNIQUE')) throw err
    }
  }
  if (donationId === null) return bad(c, 503, 'Please try again', 'حاول مرة أخرى')

  const row = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.id = ?`).bind(donationId).first<DonationRow>()
  await recordAudit(c.env.DB, {
    actorId: auth.userId,
    action: 'donation.create',
    entity: 'donations',
    entityId: donationId,
    after: { campaign_id: id, amount_millimes: row!.amount_millimes, method: 'bank_transfer' },
  })
  return c.json({ donation: toDonation(row!), bank: bankDetails(settings) }, 201)
})

export default campaigns
