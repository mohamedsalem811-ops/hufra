// Shared queries for repair campaigns and donations (plan 6.9).
// Amounts are integer thousandths of a dinar in the database ("millimes") and
// dinar in every API response (see packages/contracts/src/donations.ts).

import { DONATION_LIMITS, millimesToLyd, type DonationOpenMode } from '@hufra/contracts'
import type { Bindings } from './types'

type DB = Bindings['DB']

export const SETTING_KEYS = {
  enabled: 'donations.enabled',
  accountHolder: 'payout.account_holder',
  bankName: 'payout.bank_name',
  iban: 'payout.iban',
  accountNumber: 'payout.account_number',
  openModeIos: 'donations.open_mode_ios',
  openModeAndroid: 'donations.open_mode_android',
} as const

export interface DonationSettings {
  enabled: boolean
  account_holder: string
  bank_name: string
  iban: string
  account_number: string
  open_mode_ios: DonationOpenMode
  open_mode_android: DonationOpenMode
}

const openMode = (v: string | undefined): DonationOpenMode => (v === 'safari' ? 'safari' : 'in_app')

export async function loadDonationSettings(db: DB): Promise<DonationSettings> {
  const rows = await db.prepare(`SELECT key, value FROM app_settings WHERE key LIKE 'payout.%' OR key LIKE 'donations.%'`).all<{
    key: string
    value: string
  }>()
  const map = new Map(rows.results.map((r) => [r.key, r.value]))
  return {
    enabled: map.get(SETTING_KEYS.enabled) === '1',
    account_holder: map.get(SETTING_KEYS.accountHolder) ?? '',
    bank_name: map.get(SETTING_KEYS.bankName) ?? '',
    iban: map.get(SETTING_KEYS.iban) ?? '',
    account_number: map.get(SETTING_KEYS.accountNumber) ?? '',
    open_mode_ios: openMode(map.get(SETTING_KEYS.openModeIos)),
    open_mode_android: openMode(map.get(SETTING_KEYS.openModeAndroid)),
  }
}

/** Donations can be taken only when switched on and the bank details are filled in. */
export function bankTransferReady(s: DonationSettings): boolean {
  return s.enabled && !!s.account_holder && !!s.bank_name && (!!s.iban || !!s.account_number)
}

export function bankDetails(s: DonationSettings) {
  return { account_holder: s.account_holder, bank_name: s.bank_name, iban: s.iban, account_number: s.account_number }
}

/** Pledges whose screenshot never came are closed as expired (cheap: touches only matching rows). */
export async function expireStalePledges(db: DB): Promise<void> {
  await db
    .prepare(
      `UPDATE donations SET status = 'expired'
       WHERE status = 'awaiting_transfer' AND expires_at IS NOT NULL AND expires_at < strftime('%Y-%m-%dT%H:%M:%fZ','now')`
    )
    .run()
}

export function pledgeExpiry(now = Date.now()): string {
  return new Date(now + DONATION_LIMITS.pendingHours * 3600 * 1000).toISOString()
}

/** Unambiguous characters only (no 0/O, 1/I/L), easy to type into a transfer note. */
const REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
export function newReferenceCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6))
  let out = ''
  for (const b of bytes) out += REF_ALPHABET[b % REF_ALPHABET.length]
  return `HF-${out}`
}

/** Campaign rows with their money totals (millimes). */
const SUMMARY_SQL = `
  SELECT c.*, p.street_ar, p.street_en, r.name_ar AS region_name_ar, r.name_en AS region_name_en,
    COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed'), 0) AS confirmed_donations,
    COALESCE((SELECT SUM(a.amount_millimes) FROM campaign_allocations a WHERE a.to_campaign_id = c.id), 0) AS allocated_in,
    COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'under_review'), 0) AS under_review,
    (SELECT COUNT(DISTINCT d.user_id) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed') AS donors_count
  FROM campaigns c
  JOIN potholes p ON p.id = c.pothole_id
  JOIN regions r ON r.id = p.region_id`

export interface CampaignRow {
  id: number
  pothole_id: number
  target_millimes: number
  status: 'active' | 'funded' | 'completed' | 'cancelled'
  note_ar: string | null
  note_en: string | null
  close_reason: string | null
  created_at: string
  funded_at: string | null
  closed_at: string | null
  street_ar: string | null
  street_en: string | null
  region_name_ar: string
  region_name_en: string
  confirmed_donations: number
  allocated_in: number
  under_review: number
  donors_count: number
  cost_items_json?: string | null
  contractor?: string | null
  final_cost_millimes?: number | null
  receipt_key?: string | null
}

export async function getCampaignRow(db: DB, id: number): Promise<CampaignRow | null> {
  return db.prepare(`${SUMMARY_SQL} WHERE c.id = ?`).bind(id).first<CampaignRow>()
}

export async function listCampaignRows(db: DB, where: string, binds: unknown[] = [], limit = 50): Promise<CampaignRow[]> {
  const rows = await db.prepare(`${SUMMARY_SQL} ${where} ORDER BY c.created_at DESC LIMIT ?`).bind(...binds, limit).all<CampaignRow>()
  return rows.results
}

/** Raised = confirmed donations + money moved in from the pool. */
export const raisedMillimes = (c: Pick<CampaignRow, 'confirmed_donations' | 'allocated_in'>) => c.confirmed_donations + c.allocated_in

export function toCampaignSummary(c: CampaignRow) {
  return {
    id: c.id,
    pothole_id: c.pothole_id,
    status: c.status,
    target_lyd: millimesToLyd(c.target_millimes),
    confirmed_lyd: millimesToLyd(raisedMillimes(c)),
    under_review_lyd: millimesToLyd(c.under_review),
    donors_count: c.donors_count,
    note_ar: c.note_ar,
    note_en: c.note_en,
    street_ar: c.street_ar,
    street_en: c.street_en,
    region_name_ar: c.region_name_ar,
    region_name_en: c.region_name_en,
    created_at: c.created_at,
    funded_at: c.funded_at,
    closed_at: c.closed_at,
    cost_items: parseCostItems(c.cost_items_json),
    final_cost_lyd: c.final_cost_millimes == null ? null : millimesToLyd(c.final_cost_millimes),
    receipt_key: c.receipt_key ?? null,
  }
}

export function parseCostItems(json: string | null | undefined): { label: string; amount_lyd: number }[] {
  if (!json) return []
  try {
    const items = JSON.parse(json)
    return Array.isArray(items) ? items.map((i) => ({ label: String(i.label), amount_lyd: Number(i.amount_lyd) })) : []
  } catch {
    return []
  }
}

/**
 * The shared pool: money left over in closed campaigns (completed: anything
 * above the repair cost; cancelled: all of it), minus what was already moved
 * into later campaigns.
 */
export async function poolBalanceMillimes(db: DB): Promise<number> {
  const row = await db
    .prepare(
      `WITH raised AS (
         SELECT c.id, c.status, c.target_millimes,
           COALESCE((SELECT SUM(d.amount_millimes) FROM donations d WHERE d.campaign_id = c.id AND d.status = 'confirmed'), 0)
           + COALESCE((SELECT SUM(a.amount_millimes) FROM campaign_allocations a WHERE a.to_campaign_id = c.id), 0) AS total
         FROM campaigns c WHERE c.status IN ('completed', 'cancelled')
       )
       SELECT
         COALESCE((SELECT SUM(CASE WHEN status = 'cancelled' THEN total ELSE MAX(total - target_millimes, 0) END) FROM raised), 0)
         - COALESCE((SELECT SUM(amount_millimes) FROM campaign_allocations), 0)
         AS balance`
    )
    .first<{ balance: number }>()
  return Math.max(0, row?.balance ?? 0)
}

/** Mark a campaign funded once raised money reaches its repair cost. */
export async function markFundedIfReached(db: DB, campaignId: number): Promise<boolean> {
  const c = await getCampaignRow(db, campaignId)
  if (!c || c.status !== 'active' || raisedMillimes(c) < c.target_millimes) return false
  const res = await db
    .prepare(`UPDATE campaigns SET status = 'funded', funded_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ? AND status = 'active'`)
    .bind(campaignId)
    .run()
  return !!res.meta.changes
}

export interface DonationRow {
  id: number
  campaign_id: number
  user_id: number
  reference_code: string
  method: 'bank_transfer' | 'card_moamalat'
  amount_millimes: number
  status: 'awaiting_transfer' | 'under_review' | 'confirmed' | 'rejected' | 'expired' | 'cancelled'
  show_name: number
  proof_key: string | null
  proof_sha256: string | null
  reject_reason: string | null
  expires_at: string | null
  created_at: string
  reviewed_at: string | null
  pothole_id: number
  street_ar: string | null
  street_en: string | null
}

export const DONATION_SQL = `
  SELECT d.*, c.pothole_id, p.street_ar, p.street_en
  FROM donations d JOIN campaigns c ON c.id = d.campaign_id JOIN potholes p ON p.id = c.pothole_id`

export function toDonation(d: DonationRow) {
  return {
    id: d.id,
    campaign_id: d.campaign_id,
    pothole_id: d.pothole_id,
    reference_code: d.reference_code,
    method: d.method,
    amount_lyd: millimesToLyd(d.amount_millimes),
    status: d.status,
    show_name: d.show_name === 1,
    has_proof: !!d.proof_key,
    reject_reason: d.reject_reason,
    expires_at: d.status === 'awaiting_transfer' ? d.expires_at : null,
    created_at: d.created_at,
    reviewed_at: d.reviewed_at,
    street_ar: d.street_ar,
    street_en: d.street_en,
  }
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}
