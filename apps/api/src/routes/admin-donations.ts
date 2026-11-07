import {
  allocateSchema,
  createCampaignSchema,
  DONATION_LIMITS,
  donationSettingsSchema,
  lydToMillimes,
  millimesToLyd,
  reviewDonationSchema,
  updateCampaignSchema,
} from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import { inspectImage } from '../lib/image-check'
import { invalidatePublicCaches } from '../lib/cache'
import {
  DONATION_SQL,
  expireStalePledges,
  getCampaignRow,
  listCampaignRows,
  loadDonationSettings,
  markFundedIfReached,
  poolBalanceMillimes,
  raisedMillimes,
  SETTING_KEYS,
  toCampaignSummary,
  toDonation,
  type DonationRow,
} from '../lib/donations'
import { deferFrom, notifyAdmins, notifyUser } from '../lib/notifications'
import type { Bindings } from '../lib/types'
import { attachAuth, requireRole } from '../middleware/auth'

// Admin panel: campaigns, the donation review queue, the shared pool and the
// donation settings (plan 8.2 builds the screens on top of these).
const adminDonations = new Hono<{ Bindings: Bindings }>()
adminDonations.use('*', attachAuth, requireRole('admin', 'super_admin'))

const bad = (c: any, status: 400 | 403 | 404 | 409, error: string, error_ar: string) => c.json({ error, error_ar }, status)
const idParam = (raw: string | undefined) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
const noStore = (c: any) => c.header('Cache-Control', 'private, no-store')

function adminCampaign(row: Awaited<ReturnType<typeof getCampaignRow>> & {}) {
  return {
    ...toCampaignSummary(row),
    close_reason: row.close_reason,
    raised_millimes: raisedMillimes(row),
    contractor: row.contractor ?? null,
  }
}

const itemsJson = (items: { label: string; amount_lyd: number }[] | undefined) =>
  items?.length ? JSON.stringify(items.map((i) => ({ label: i.label, amount_lyd: i.amount_lyd }))) : null
const sumItems = (items: { amount_lyd: number }[]) => millimesToLyd(items.reduce((t, i) => t + lydToMillimes(i.amount_lyd), 0))

// GET /api/admin/campaigns?status=... - every campaign, plus the pool balance.
adminDonations.get('/campaigns', async (c) => {
  noStore(c)
  const status = c.req.query('status')
  const valid = ['active', 'funded', 'completed', 'cancelled']
  const rows = status && valid.includes(status)
    ? await listCampaignRows(c.env.DB, 'WHERE c.status = ?', [status], 200)
    : await listCampaignRows(c.env.DB, '', [], 200)
  return c.json({ results: rows.map(adminCampaign), pool_lyd: millimesToLyd(await poolBalanceMillimes(c.env.DB)) })
})

// POST /api/admin/campaigns - start a campaign for a report: the team sets the repair cost.
adminDonations.post('/campaigns', async (c) => {
  const auth = c.get('auth')!
  const parsed = createCampaignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, 'Invalid input', 'بيانات غير صحيحة')
  const { pothole_id, target_lyd, cost_items, contractor, note_ar, note_en } = parsed.data
  const pothole = await c.env.DB.prepare('SELECT id, status FROM potholes WHERE id = ? AND deleted_at IS NULL').bind(pothole_id).first<{ status: string }>()
  if (!pothole) return bad(c, 404, 'Report not found', 'البلاغ غير موجود')
  if (pothole.status === 'fixed') return bad(c, 409, 'This pothole is already fixed', 'هذه الحفرة أُصلحت')
  try {
    const res = await c.env.DB.prepare(
      'INSERT INTO campaigns (pothole_id, target_millimes, cost_items_json, contractor, note_ar, note_en, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
      .bind(pothole_id, lydToMillimes(target_lyd), itemsJson(cost_items), contractor || null, note_ar || null, note_en || null, auth.userId)
      .run()
    const id = Number(res.meta.last_row_id)
    await recordAudit(c.env.DB, { actorId: auth.userId, action: 'campaign.create', entity: 'campaigns', entityId: id, after: parsed.data })
    await invalidatePublicCaches()
    return c.json({ campaign: adminCampaign((await getCampaignRow(c.env.DB, id))!) }, 201)
  } catch (err) {
    if (String(err).includes('UNIQUE')) return bad(c, 409, 'This report already has an open campaign', 'لهذا البلاغ حملة مفتوحة بالفعل')
    throw err
  }
})

// PATCH /api/admin/campaigns/:id - change the cost or notes, complete or cancel.
adminDonations.patch('/campaigns/:id', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const parsed = updateCampaignSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, 'Invalid input', 'بيانات غير صحيحة')
  const before = await getCampaignRow(c.env.DB, id)
  if (!before) return bad(c, 404, 'Not found', 'غير موجود')
  const { status, reason, note_ar, note_en, cost_items, contractor, final_cost_lyd } = parsed.data
  // A breakdown sets the target: the two can never disagree.
  const target_lyd = cost_items?.length ? sumItems(cost_items) : parsed.data.target_lyd
  const closed = before.status === 'completed' || before.status === 'cancelled'
  // After the repair, only the published facts can still be added or corrected.
  const onlyPublishing = Object.keys(parsed.data).every((k) => k === 'final_cost_lyd' || k === 'contractor')
  if (closed && !(before.status === 'completed' && onlyPublishing)) return bad(c, 409, 'This campaign is closed', 'هذه الحملة مغلقة')
  if (status === 'cancelled' && !reason) return bad(c, 400, 'Cancelling needs a reason', 'الإلغاء يحتاج سبباً')
  if (final_cost_lyd !== undefined && status !== 'completed' && before.status !== 'completed') {
    return bad(c, 400, 'The final cost is published when the campaign is completed', 'التكلفة النهائية تُنشر عند إكمال الحملة')
  }

  const sets: string[] = ["updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"]
  const binds: unknown[] = []
  if (target_lyd !== undefined) sets.push('target_millimes = ?'), binds.push(lydToMillimes(target_lyd))
  if (cost_items !== undefined) sets.push('cost_items_json = ?'), binds.push(itemsJson(cost_items))
  if (contractor !== undefined) sets.push('contractor = ?'), binds.push(contractor || null)
  if (final_cost_lyd !== undefined) sets.push('final_cost_millimes = ?'), binds.push(lydToMillimes(final_cost_lyd))
  if (note_ar !== undefined) sets.push('note_ar = ?'), binds.push(note_ar || null)
  if (note_en !== undefined) sets.push('note_en = ?'), binds.push(note_en || null)
  if (status) {
    sets.push('status = ?', "closed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')", 'close_reason = ?')
    binds.push(status, reason || null)
  }
  await c.env.DB.prepare(`UPDATE campaigns SET ${sets.join(', ')} WHERE id = ?`).bind(...binds, id).run()
  // A lower cost may already be covered; a higher one reopens a funded campaign.
  if (!status && target_lyd !== undefined) {
    if (before.status === 'funded' && lydToMillimes(target_lyd) > raisedMillimes(before)) {
      await c.env.DB.prepare(`UPDATE campaigns SET status = 'active', funded_at = NULL WHERE id = ?`).bind(id).run()
    } else {
      await markFundedIfReached(c.env.DB, id)
    }
  }
  const after = (await getCampaignRow(c.env.DB, id))!
  await recordAudit(c.env.DB, {
    actorId: auth.userId,
    action: status ? `campaign.${status}` : 'campaign.update',
    entity: 'campaigns',
    entityId: id,
    before: { status: before.status, target_millimes: before.target_millimes, final_cost_millimes: before.final_cost_millimes ?? null },
    after: { status: after.status, target_millimes: after.target_millimes, final_cost_millimes: after.final_cost_millimes ?? null, reason: reason ?? null },
  })
  await invalidatePublicCaches()
  return c.json({ campaign: adminCampaign(after), pool_lyd: millimesToLyd(await poolBalanceMillimes(c.env.DB)) })
})

// POST /api/admin/campaigns/:id/allocate - move money from the shared pool into an open campaign.
adminDonations.post('/campaigns/:id/allocate', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const parsed = allocateSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, 'Invalid input', 'بيانات غير صحيحة')
  const campaign = await getCampaignRow(c.env.DB, id)
  if (!campaign) return bad(c, 404, 'Not found', 'غير موجود')
  if (campaign.status !== 'active') return bad(c, 409, 'Only an active campaign can receive money', 'الحملة النشطة فقط تستقبل المبالغ')
  const amount = lydToMillimes(parsed.data.amount_lyd)
  if (amount > (await poolBalanceMillimes(c.env.DB))) return bad(c, 409, 'Not enough money in the pool', 'الرصيد المتبقي غير كافٍ')
  await c.env.DB.prepare('INSERT INTO campaign_allocations (to_campaign_id, amount_millimes, note, created_by) VALUES (?, ?, ?, ?)')
    .bind(id, amount, parsed.data.note || null, auth.userId)
    .run()
  await markFundedIfReached(c.env.DB, id)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'campaign.allocate', entity: 'campaigns', entityId: id, after: { amount_millimes: amount } })
  await invalidatePublicCaches()
  return c.json({ campaign: adminCampaign((await getCampaignRow(c.env.DB, id))!), pool_lyd: millimesToLyd(await poolBalanceMillimes(c.env.DB)) })
})

// POST /api/admin/campaigns/:id/receipt - the repair receipt, published with
// the final cost (multipart: receipt, a JPEG/WebP compressed in the panel).
// Stored under photos/receipts/, which the public /media route serves.
adminDonations.post('/campaigns/:id/receipt', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  if (Number(c.req.header('Content-Length') || 0) > DONATION_LIMITS.receipt.maxBytes + 64 * 1024) {
    return c.json({ error: 'Receipt too large', error_ar: 'صورة الإيصال كبيرة جداً' }, 413)
  }
  const campaign = await getCampaignRow(c.env.DB, id)
  if (!campaign) return bad(c, 404, 'Not found', 'غير موجود')
  if (campaign.status === 'cancelled') return bad(c, 409, 'This campaign was cancelled', 'هذه الحملة ملغاة')

  const form = await c.req.formData().catch(() => null)
  const file = form?.get('receipt')
  if (!file || typeof file === 'string') return bad(c, 400, 'Missing receipt', 'صورة الإيصال مفقودة')
  if (file.size > DONATION_LIMITS.receipt.maxBytes) return c.json({ error: 'Receipt too large', error_ar: 'صورة الإيصال كبيرة جداً' }, 413)
  const bytes = await file.arrayBuffer()
  const info = inspectImage(bytes)
  if (!info) return bad(c, 400, 'Unsupported or damaged image (WebP or JPEG only)', 'صورة غير مدعومة أو تالفة (WebP أو JPEG فقط)')
  if (Math.max(info.width, info.height) > DONATION_LIMITS.receipt.maxLongEdgePx) return c.json({ error: 'Receipt dimensions too large', error_ar: 'أبعاد الصورة كبيرة جداً' }, 413)
  if (info.hasExif) return bad(c, 400, 'Image still contains camera metadata (EXIF)', 'الصورة تحتوي بيانات الكاميرا (EXIF)')

  const key = `photos/receipts/${id}/${crypto.randomUUID()}.${info.type === 'image/jpeg' ? 'jpg' : 'webp'}`
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: info.type, cacheControl: 'public, max-age=31536000, immutable' } })
  await c.env.DB.prepare(
    `UPDATE campaigns SET receipt_key = ?, receipt_uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'), updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  )
    .bind(key, id)
    .run()
  if (campaign.receipt_key) await c.env.PHOTOS.delete(campaign.receipt_key).catch(() => undefined)
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'campaign.receipt', entity: 'campaigns', entityId: id, after: { receipt_key: key } })
  await invalidatePublicCaches()
  return c.json({ campaign: adminCampaign((await getCampaignRow(c.env.DB, id))!) }, 201)
})

// GET /api/admin/donations?status=under_review - the review queue (oldest first) or any status.
adminDonations.get('/donations', async (c) => {
  noStore(c)
  await expireStalePledges(c.env.DB)
  const status = c.req.query('status') || 'under_review'
  const valid = ['awaiting_transfer', 'under_review', 'confirmed', 'rejected', 'expired', 'cancelled']
  if (!valid.includes(status)) return bad(c, 400, 'Invalid status', 'حالة غير صحيحة')
  const order = status === 'under_review' ? 'ASC' : 'DESC'
  const rows = await c.env.DB.prepare(
    `SELECT x.*, u.email AS donor_email, u.display_name AS donor_name, u.code AS donor_code,
       (SELECT COUNT(*) FROM donations o WHERE o.user_id = x.user_id AND o.id != x.id AND o.status = 'under_review' AND o.amount_millimes = x.amount_millimes) AS same_amount_pending,
       (SELECT COUNT(*) FROM donations o WHERE o.user_id = x.user_id AND o.id != x.id AND o.status = 'rejected') AS earlier_rejections
     FROM (${DONATION_SQL} WHERE d.status = ?) x
     JOIN users u ON u.id = x.user_id ORDER BY x.created_at ${order} LIMIT 200`
  )
    .bind(status)
    .all<
      DonationRow & {
        donor_email: string
        donor_name: string | null
        donor_code: string
        same_amount_pending: number
        earlier_rejections: number
        pledged_millimes: number | null
        proof_uploaded_at: string | null
      }
    >()
  const counts = await c.env.DB.prepare(
    `SELECT status, COUNT(*) AS n FROM donations WHERE status IN ('under_review','awaiting_transfer','confirmed','rejected') GROUP BY status`
  ).all<{ status: string; n: number }>()
  const count = (s: string) => counts.results.find((r) => r.status === s)?.n ?? 0
  return c.json({
    results: rows.results.map((r) => ({
      ...toDonation(r),
      donor: { email: r.donor_email, name: r.donor_name, code: r.donor_code },
      proof_url: r.proof_key ? `/api/donations/${r.id}/proof` : null,
      proof_uploaded_at: r.proof_uploaded_at ?? null,
      warnings: [
        ...(r.amount_millimes >= lydToMillimes(DONATION_LIMITS.largeLyd) ? ['large_amount'] : []),
        ...(r.same_amount_pending > 0 ? ['same_amount_pending'] : []),
        ...(r.earlier_rejections > 0 ? ['earlier_rejections'] : []),
        ...(r.pledged_millimes != null && r.pledged_millimes !== r.amount_millimes ? ['amount_changed'] : []),
      ],
    })),
    counts: {
      under_review: count('under_review'),
      awaiting_transfer: count('awaiting_transfer'),
      confirmed: count('confirmed'),
      rejected: count('rejected'),
    },
  })
})

// POST /api/admin/donations/:id/review - confirm (optionally with the amount that arrived) or reject with a reason.
adminDonations.post('/donations/:id/review', async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const parsed = reviewDonationSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) return bad(c, 400, 'Invalid input', 'بيانات غير صحيحة')
  const row = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.id = ?`).bind(id).first<DonationRow>()
  if (!row) return bad(c, 404, 'Not found', 'غير موجود')
  if (row.status !== 'under_review') return bad(c, 409, 'Only a donation under review can be decided', 'يمكن البت في التبرعات قيد المراجعة فقط')

  const decision = parsed.data
  const amount = decision.decision === 'confirm' && decision.amount_lyd !== undefined ? lydToMillimes(decision.amount_lyd) : row.amount_millimes
  const res = await c.env.DB.prepare(
    `UPDATE donations SET status = ?, amount_millimes = ?, reject_reason = ?, reviewed_by = ?,
       reviewed_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
     WHERE id = ? AND status = 'under_review'`
  )
    .bind(decision.decision === 'confirm' ? 'confirmed' : 'rejected', amount, decision.decision === 'reject' ? decision.reason : null, auth.userId, id)
    .run()
  if (!res.meta.changes) return bad(c, 409, 'Someone else just decided this donation', 'بتّ أحد آخر في هذا التبرع للتو')

  const funded = decision.decision === 'confirm' ? await markFundedIfReached(c.env.DB, row.campaign_id) : false
  await recordAudit(c.env.DB, {
    actorId: auth.userId,
    action: `donation.${decision.decision}`,
    entity: 'donations',
    entityId: id,
    before: { status: row.status, amount_millimes: row.amount_millimes },
    after: { status: decision.decision === 'confirm' ? 'confirmed' : 'rejected', amount_millimes: amount, reason: decision.decision === 'reject' ? decision.reason : null },
  })
  await notifyUser(
    c.env.DB,
    row.user_id,
    decision.decision === 'confirm' ? 'donation_confirmed' : 'donation_rejected',
    { donation_id: id, pothole_id: row.pothole_id, amount_lyd: millimesToLyd(amount), street_ar: row.street_ar, street_en: row.street_en },
    c.env,
    deferFrom(c)
  )
  await invalidatePublicCaches()
  const updated = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.id = ?`).bind(id).first<DonationRow>()
  return c.json({ donation: toDonation(updated!), campaign_funded: funded })
})

// GET /api/admin/settings/donations - bank details and app behaviour.
adminDonations.get('/settings/donations', async (c) => {
  noStore(c)
  return c.json({ settings: await loadDonationSettings(c.env.DB) })
})

// PUT /api/admin/settings/donations - super admins only: changing where money goes is the riskiest edit.
adminDonations.put('/settings/donations', requireRole('super_admin'), async (c) => {
  const auth = c.get('auth')!
  const parsed = donationSettingsSchema.safeParse(await c.req.json().catch(() => null))
  if (!parsed.success) {
    const msg = parsed.error.issues[0]?.message ?? 'Invalid input'
    return c.json({ error: msg, error_ar: msg.includes('IBAN') ? 'رقم IBAN غير صحيح' : msg.includes('Account') ? 'رقم الحساب من 6 إلى 20 رقماً' : 'بيانات غير صحيحة' }, 400)
  }
  const s = parsed.data
  if (s.enabled && (!s.account_holder || !s.bank_name || (!s.iban && !s.account_number))) {
    return bad(c, 400, 'Fill in the account holder, bank and an IBAN or account number before opening donations', 'أكمل اسم صاحب الحساب والمصرف ورقم IBAN أو الحساب قبل فتح التبرعات')
  }
  const before = await loadDonationSettings(c.env.DB)
  const values: [string, string][] = [
    [SETTING_KEYS.enabled, s.enabled ? '1' : '0'],
    [SETTING_KEYS.accountHolder, s.account_holder],
    [SETTING_KEYS.bankName, s.bank_name],
    [SETTING_KEYS.iban, s.iban],
    [SETTING_KEYS.accountNumber, s.account_number],
    [SETTING_KEYS.openModeIos, s.open_mode_ios],
    [SETTING_KEYS.openModeAndroid, s.open_mode_android],
  ]
  await c.env.DB.batch(
    values.map(([key, value]) =>
      c.env.DB.prepare(
        `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      ).bind(key, value, auth.userId)
    )
  )
  await recordAudit(c.env.DB, { actorId: auth.userId, action: 'settings.donations', entity: 'app_settings', before, after: s })
  // Every admin hears about a change to the bank details, so a wrong or malicious edit is noticed at once.
  const bankChanged = ['account_holder', 'bank_name', 'iban', 'account_number'].some((k) => (before as any)[k] !== (s as any)[k])
  if (bankChanged) await notifyAdmins(c.env.DB, 'payout_changed', { by: auth.code }, c.env, deferFrom(c))
  return c.json({ settings: await loadDonationSettings(c.env.DB) })
})

export default adminDonations
