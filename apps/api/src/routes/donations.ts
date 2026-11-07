import { DONATION_LIMITS, lydAmountSchema, lydToMillimes } from '@hufra/contracts'
import { Hono } from 'hono'

import { recordAudit } from '../lib/audit'
import {
  bankDetails,
  bankTransferReady,
  DONATION_SQL,
  expireStalePledges,
  loadDonationSettings,
  sha256Hex,
  toDonation,
  type DonationRow,
} from '../lib/donations'
import { inspectImage } from '../lib/image-check'
import { beforeCursor, readPage, toPage } from '../lib/paging'
import { deferFrom, notifyAdmins } from '../lib/notifications'
import { checkRateLimit, tooMany } from '../lib/rate-limit'
import type { Bindings } from '../lib/types'
import { attachAuth, requireAuth } from '../middleware/auth'

// A donor's own donations. Transfer screenshots are private: stored under
// "proofs/" in R2, which the public /media route never serves.
const donations = new Hono<{ Bindings: Bindings }>()
donations.use('*', attachAuth)

const bad = (c: any, status: 400 | 403 | 404 | 409 | 413 | 429, error: string, error_ar: string) => c.json({ error, error_ar }, status)
const idParam = (raw: string | undefined) => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : null
}
const isAdminRole = (role: string) => role === 'admin' || role === 'super_admin'

// GET /api/donations/config - whether donations are open and how the app opens the page. Public.
donations.get('/config', async (c) => {
  const s = await loadDonationSettings(c.env.DB)
  return c.json({
    enabled: bankTransferReady(s),
    open_mode: { ios: s.open_mode_ios, android: s.open_mode_android },
    methods: { bank_transfer: bankTransferReady(s), card_moamalat: false },
  })
})

// GET /api/donations/mine - the signed-in person's donations, newest first.
donations.get('/mine', requireAuth(), async (c) => {
  const page = readPage(c.req.query())
  if (!page) return bad(c, 400, 'Invalid query', 'معايير بحث غير صحيحة')
  await expireStalePledges(c.env.DB)
  const after = beforeCursor('d.id', page)
  const rows = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.user_id = ?${after.sql} ORDER BY d.id DESC LIMIT ?`)
    .bind(c.get('auth')!.userId, ...after.binds, page.limit + 1)
    .all<DonationRow>()
  c.header('Cache-Control', 'private, no-store')
  const out = toPage(rows.results, page)
  return c.json({ results: out.results.map(toDonation), next_cursor: out.next_cursor })
})

async function ownDonation(c: any, id: number): Promise<DonationRow | null> {
  const row = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.id = ?`).bind(id).first()
  if (!row) return null
  const auth = c.get('auth')!
  return row.user_id === auth.userId ? (row as DonationRow) : null
}

// GET /api/donations/:id - one of my donations; bank details while the transfer is still due.
donations.get('/:id', requireAuth(), async (c) => {
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  await expireStalePledges(c.env.DB)
  const row = await ownDonation(c, id)
  if (!row) return bad(c, 404, 'Not found', 'غير موجود')
  const needsBank = row.status === 'awaiting_transfer' || row.status === 'under_review'
  c.header('Cache-Control', 'private, no-store')
  return c.json({ donation: toDonation(row), bank: needsBank ? bankDetails(await loadDonationSettings(c.env.DB)) : null })
})

// POST /api/donations/:id/proof - upload the transfer screenshot (multipart: proof, optional amount_lyd).
donations.post('/:id/proof', requireAuth(), async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')

  const rl = await checkRateLimit(c.env, 'donation_proof', String(auth.userId), 20, 3600)
  if (!rl.allowed) return tooMany(c, rl, 'Too many uploads, try again later', 'رفع كثير، حاول لاحقاً')
  // Refuse a far-too-big body before reading it.
  if (Number(c.req.header('Content-Length') || 0) > DONATION_LIMITS.proof.maxBytes + 64 * 1024) {
    return bad(c, 413, 'Screenshot too large: it must be compressed before upload', 'الصورة كبيرة جداً، يجب ضغطها قبل الرفع')
  }

  await expireStalePledges(c.env.DB)
  const row = await ownDonation(c, id)
  if (!row) return bad(c, 404, 'Not found', 'غير موجود')
  if (row.status !== 'awaiting_transfer' && row.status !== 'under_review') {
    return bad(c, 409, 'This donation can no longer take a screenshot', 'لا يمكن إضافة صورة لهذا التبرع الآن')
  }

  const form = await c.req.formData().catch(() => null)
  const file = form?.get('proof')
  if (!file || typeof file === 'string') return bad(c, 400, 'Missing screenshot', 'الصورة مفقودة')
  if (file.size > DONATION_LIMITS.proof.maxBytes) {
    return bad(c, 413, 'Screenshot too large: it must be compressed before upload', 'الصورة كبيرة جداً، يجب ضغطها قبل الرفع')
  }
  const bytes = await file.arrayBuffer()
  const info = inspectImage(bytes)
  if (!info || !(DONATION_LIMITS.proof.types as readonly string[]).includes(info.type)) {
    return bad(c, 400, 'Unsupported or damaged image (WebP or JPEG only)', 'صورة غير مدعومة أو تالفة (WebP أو JPEG فقط)')
  }
  if (Math.max(info.width, info.height) > DONATION_LIMITS.proof.maxLongEdgePx) {
    return bad(c, 413, 'Screenshot dimensions too large', 'أبعاد الصورة كبيرة جداً')
  }
  if (info.hasExif) return bad(c, 400, 'Image still contains camera metadata (EXIF)', 'الصورة تحتوي بيانات الكاميرا (EXIF)')

  // The amount actually transferred, if the donor corrects it.
  let amount = row.amount_millimes
  const typed = form?.get('amount_lyd')
  if (typeof typed === 'string' && typed.trim()) {
    const parsed = lydAmountSchema.min(DONATION_LIMITS.minLyd).max(DONATION_LIMITS.maxLyd).safeParse(Number(typed))
    if (!parsed.success) return bad(c, 400, 'Invalid amount', 'مبلغ غير صحيح')
    amount = lydToMillimes(parsed.data)
  }

  const hash = await sha256Hex(bytes)
  const reused = await c.env.DB.prepare('SELECT id FROM donations WHERE proof_sha256 = ? AND id != ?').bind(hash, id).first()
  if (reused) return bad(c, 409, 'This screenshot was already used for another donation', 'هذه الصورة استُخدمت لتبرع آخر')

  const key = `proofs/${id}/${crypto.randomUUID()}.${info.type === 'image/jpeg' ? 'jpg' : 'webp'}`
  await c.env.PHOTOS.put(key, bytes, { httpMetadata: { contentType: info.type, cacheControl: 'private, no-store' } })
  const res = await c.env.DB.prepare(
    `UPDATE donations SET proof_key = ?, proof_sha256 = ?, proof_uploaded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
       pledged_millimes = CASE WHEN ? != amount_millimes THEN COALESCE(pledged_millimes, amount_millimes) ELSE pledged_millimes END,
       amount_millimes = ?, status = 'under_review', expires_at = NULL
     WHERE id = ? AND status IN ('awaiting_transfer', 'under_review')`
  )
    .bind(key, hash, amount, amount, id)
    .run()
  if (!res.meta.changes) {
    await c.env.PHOTOS.delete(key)
    return bad(c, 409, 'This donation changed, please reload', 'تغيّر هذا التبرع، أعد التحميل')
  }
  if (row.proof_key && row.proof_key !== key) await c.env.PHOTOS.delete(row.proof_key).catch(() => undefined)

  await recordAudit(c.env.DB, {
    actorId: auth.userId,
    action: 'donation.proof_upload',
    entity: 'donations',
    entityId: id,
    before: { amount_millimes: row.amount_millimes, status: row.status },
    after: { amount_millimes: amount, status: 'under_review' },
  })
  await notifyAdmins(c.env.DB, 'donation_review', { donation_id: id, campaign_id: row.campaign_id, pothole_id: row.pothole_id }, c.env, deferFrom(c))

  const updated = await c.env.DB.prepare(`${DONATION_SQL} WHERE d.id = ?`).bind(id).first<DonationRow>()
  return c.json({ donation: toDonation(updated!) })
})

// POST /api/donations/:id/cancel - withdraw a pledge before sending the transfer.
donations.post('/:id/cancel', requireAuth(), async (c) => {
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const row = await ownDonation(c, id)
  if (!row) return bad(c, 404, 'Not found', 'غير موجود')
  const res = await c.env.DB.prepare(`UPDATE donations SET status = 'cancelled' WHERE id = ? AND status = 'awaiting_transfer'`).bind(id).run()
  if (!res.meta.changes) return bad(c, 409, 'Only a donation still waiting for the transfer can be cancelled', 'يمكن إلغاء التبرع قبل التحويل فقط')
  await recordAudit(c.env.DB, { actorId: row.user_id, action: 'donation.cancel', entity: 'donations', entityId: id })
  return c.json({ ok: true })
})

// GET /api/donations/:id/proof - the screenshot, for its donor and the review team only.
donations.get('/:id/proof', requireAuth(), async (c) => {
  const auth = c.get('auth')!
  const id = idParam(c.req.param('id'))
  if (!id) return bad(c, 400, 'Invalid id', 'رقم غير صحيح')
  const row = await c.env.DB.prepare('SELECT user_id, proof_key FROM donations WHERE id = ?').bind(id).first<{ user_id: number; proof_key: string | null }>()
  if (!row || !row.proof_key || (row.user_id !== auth.userId && !isAdminRole(auth.role))) return bad(c, 404, 'Not found', 'غير موجود')
  const object = await c.env.PHOTOS.get(row.proof_key)
  if (!object) return bad(c, 404, 'Not found', 'غير موجود')
  const headers = new Headers()
  headers.set('content-type', object.httpMetadata?.contentType ?? 'image/jpeg')
  headers.set('cache-control', 'private, no-store')
  headers.set('x-content-type-options', 'nosniff')
  return new Response(object.body as any, { headers })
})

export default donations
