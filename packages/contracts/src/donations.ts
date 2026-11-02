// Repair campaigns and donations (plan 6.9). Money is shown in Libyan dinar
// everywhere; the server stores whole thousandths of a dinar (1 LYD = 1000)
// so totals never suffer floating-point rounding, and because the Moamalat
// card gateway (later) counts in the same unit.

import { z } from 'zod'

const id = z.number().int().positive()
const timestamp = z.string().min(10)
const nullableTimestamp = timestamp.nullable()
const nullableText = z.string().nullable()

export const DONATION_LIMITS = {
  /** Smallest and largest single donation, dinar. */
  minLyd: 1,
  maxLyd: 100_000,
  /** Largest repair cost a campaign may target, dinar. */
  maxTargetLyd: 10_000_000,
  /** A pledge without a transfer screenshot expires after this many hours. */
  pendingHours: 48,
  /** Transfer screenshots, compressed on the device before upload. */
  proof: { maxBytes: 600 * 1024, maxLongEdgePx: 1600, types: ['image/webp', 'image/jpeg'] as const },
  rejectReasonMax: 300,
  noteMax: 600,
} as const

/** Dinar (up to 3 decimals) -> integer thousandths. */
export function lydToMillimes(lyd: number): number {
  return Math.round(lyd * 1000)
}

/** Integer thousandths -> dinar. */
export function millimesToLyd(millimes: number): number {
  return Math.round(millimes) / 1000
}

/** A dinar amount with at most 3 decimals (the smallest Libyan unit). */
export const lydAmountSchema = z
  .number()
  .finite()
  .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, 'At most 3 decimal places')

export const campaignStatusSchema = z.enum(['active', 'funded', 'completed', 'cancelled'])
export const donationMethodSchema = z.enum(['bank_transfer', 'card_moamalat'])
export const donationStatusSchema = z.enum(['awaiting_transfer', 'under_review', 'confirmed', 'rejected', 'expired', 'cancelled'])
export const donationOpenModeSchema = z.enum(['in_app', 'safari'])

// ---------------------------------------------------------------- requests

export const createDonationSchema = z.object({
  amount_lyd: lydAmountSchema.min(DONATION_LIMITS.minLyd).max(DONATION_LIMITS.maxLyd),
  /** Show the donor's name on the public donor wall (default: anonymous). */
  show_name: z.boolean().default(false),
  method: donationMethodSchema.default('bank_transfer'),
})

export const createCampaignSchema = z.object({
  pothole_id: id,
  target_lyd: lydAmountSchema.min(1).max(DONATION_LIMITS.maxTargetLyd),
  note_ar: z.string().trim().max(DONATION_LIMITS.noteMax).optional(),
  note_en: z.string().trim().max(DONATION_LIMITS.noteMax).optional(),
})

export const updateCampaignSchema = z
  .object({
    target_lyd: lydAmountSchema.min(1).max(DONATION_LIMITS.maxTargetLyd).optional(),
    status: z.enum(['completed', 'cancelled']).optional(),
    reason: z.string().trim().max(DONATION_LIMITS.rejectReasonMax).optional(),
    note_ar: z.string().trim().max(DONATION_LIMITS.noteMax).optional(),
    note_en: z.string().trim().max(DONATION_LIMITS.noteMax).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change')

export const allocateSchema = z.object({
  amount_lyd: lydAmountSchema.positive().max(DONATION_LIMITS.maxTargetLyd),
  note: z.string().trim().max(DONATION_LIMITS.rejectReasonMax).optional(),
})

export const reviewDonationSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('confirm'),
    /** The amount that actually arrived, if different from the pledge. */
    amount_lyd: lydAmountSchema.min(DONATION_LIMITS.minLyd).max(DONATION_LIMITS.maxLyd).optional(),
  }),
  z.object({ decision: z.literal('reject'), reason: z.string().trim().min(3).max(DONATION_LIMITS.rejectReasonMax) }),
])

/** Libyan IBAN: "LY" + 2 check digits + 21 digits (25 characters), checked with ISO 7064 mod 97. */
export function isValidLibyanIban(raw: string): boolean {
  const iban = raw.replace(/[\s-]/g, '').toUpperCase()
  if (!/^LY\d{23}$/.test(iban)) return false
  const rearranged = iban.slice(4) + iban.slice(0, 4)
  const digits = rearranged.replace(/[A-Z]/g, (ch) => String(ch.charCodeAt(0) - 55))
  let rem = 0
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97
  return rem === 1
}

export const donationSettingsSchema = z.object({
  enabled: z.boolean(),
  account_holder: z.string().trim().max(120),
  bank_name: z.string().trim().max(120),
  iban: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, '').toUpperCase())
    .refine((s) => s === '' || isValidLibyanIban(s), 'Not a valid Libyan IBAN'),
  account_number: z
    .string()
    .trim()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .refine((s) => s === '' || /^\d{6,20}$/.test(s), 'Account number: 6 to 20 digits'),
  open_mode_ios: donationOpenModeSchema,
  open_mode_android: donationOpenModeSchema,
})

export const webHandoffSchema = z.object({
  /** Where the website should land after signing in: a path on our own site. */
  next: z
    .string()
    .trim()
    .max(300)
    .refine((p) => /^\/[^/\\]/.test(p) || p === '/', 'Must be a path on this site'),
})

// ---------------------------------------------------------------- responses

const money = z.number().min(0)

export const campaignSummarySchema = z.strictObject({
  id,
  pothole_id: id,
  status: campaignStatusSchema,
  target_lyd: money,
  /** Confirmed donations plus money moved in from earlier campaigns. */
  confirmed_lyd: money,
  /** Transfers with a screenshot, still being checked: shown apart, never counted as raised. */
  under_review_lyd: money,
  donors_count: z.number().int().min(0),
  note_ar: nullableText,
  note_en: nullableText,
  street_ar: nullableText,
  street_en: nullableText,
  region_name_ar: z.string(),
  region_name_en: z.string(),
  created_at: timestamp,
  funded_at: nullableTimestamp,
  closed_at: nullableTimestamp,
})

export const donorWallEntrySchema = z.strictObject({
  /** null when the donor chose to stay anonymous. */
  name: nullableText,
  amount_lyd: money,
  confirmed_at: timestamp,
})

export const campaignDetailResponseSchema = z.strictObject({
  campaign: campaignSummarySchema,
  donors: z.array(donorWallEntrySchema),
})
export const campaignListResponseSchema = z.strictObject({ results: z.array(campaignSummarySchema) })
export const potholeCampaignResponseSchema = z.strictObject({ campaign: campaignSummarySchema.nullable() })

export const bankDetailsSchema = z.strictObject({
  account_holder: z.string(),
  bank_name: z.string(),
  iban: z.string(),
  account_number: z.string(),
})

export const donationSchema = z.strictObject({
  id,
  campaign_id: id,
  pothole_id: id,
  reference_code: z.string(),
  method: donationMethodSchema,
  amount_lyd: money,
  status: donationStatusSchema,
  show_name: z.boolean(),
  has_proof: z.boolean(),
  reject_reason: nullableText,
  expires_at: nullableTimestamp,
  created_at: timestamp,
  reviewed_at: nullableTimestamp,
  street_ar: nullableText,
  street_en: nullableText,
})

export const createDonationResponseSchema = z.strictObject({ donation: donationSchema, bank: bankDetailsSchema })
export const donationDetailResponseSchema = z.strictObject({ donation: donationSchema, bank: bankDetailsSchema.nullable() })
export const myDonationsResponseSchema = z.strictObject({ results: z.array(donationSchema) })

export const donationConfigResponseSchema = z.strictObject({
  enabled: z.boolean(),
  open_mode: z.strictObject({ ios: donationOpenModeSchema, android: donationOpenModeSchema }),
  methods: z.strictObject({ bank_transfer: z.boolean(), card_moamalat: z.boolean() }),
})

export const webHandoffResponseSchema = z.strictObject({ url: z.string(), expires_in: z.number().int() })

export type CampaignStatus = z.infer<typeof campaignStatusSchema>
export type DonationStatus = z.infer<typeof donationStatusSchema>
export type DonationMethod = z.infer<typeof donationMethodSchema>
export type DonationOpenMode = z.infer<typeof donationOpenModeSchema>
export type CampaignSummary = z.infer<typeof campaignSummarySchema>
export type CampaignDetailResponse = z.infer<typeof campaignDetailResponseSchema>
export type Donation = z.infer<typeof donationSchema>
export type DonationConfig = z.infer<typeof donationConfigResponseSchema>
export type BankDetails = z.infer<typeof bankDetailsSchema>
