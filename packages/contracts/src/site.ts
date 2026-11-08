// Plan 8.2: settings the owner edits in the admin panel and the website and
// app read: general rules, contact details and the legal information.
import { z } from 'zod'

const timestamp = z.string().min(10)
const optionalEmail = z.union([z.literal(''), z.string().trim().toLowerCase().email().max(200)])

/** Rules the team can tune without a new release. */
export const generalRulesSchema = z.object({
  /** New reports this close to an open one are flagged as possible duplicates. */
  duplicate_radius_m: z.number().int().min(10).max(500),
  /** A pledge without a transfer screenshot expires after this many hours. */
  pending_hours: z.number().int().min(1).max(720),
  /** Donations at or above this get a "large amount" warning in review, dinar. */
  large_lyd: z.number().int().min(1).max(100_000),
})
export const GENERAL_RULE_DEFAULTS = { duplicate_radius_m: 50, pending_hours: 48, large_lyd: 500 } as const

/** Shown on the website, the legal pages and the app ("Contact us"). */
export const contactSettingsSchema = z.object({
  public_email: optionalEmail,
  privacy_email: optionalEmail,
  phone: z.string().trim().max(30).regex(/^[+\d\s()-]*$/, 'Digits, spaces, + and - only'),
  social_links: z.array(z.string().trim().url().max(300).refine((u) => /^https:\/\//.test(u), 'Use an https:// link')).max(6),
})

/** Fills the blanks in the privacy policy, terms and donation rules. */
export const legalInfoSchema = z.object({
  legal_name_ar: z.string().trim().max(200),
  legal_name_en: z.string().trim().max(200),
  registration_no: z.string().trim().max(100),
  address: z.string().trim().max(300),
  courts: z.string().trim().max(200),
  /** Years financial records are kept (set by the lawyer). */
  retention_financial_years: z.number().int().min(0).max(50).nullable(),
  retention_screenshots_days: z.number().int().min(1).max(3650),
  wrong_transfer_days: z.number().int().min(1).max(365),
  privacy_reply_days: z.number().int().min(1).max(90),
})
export const LEGAL_DEFAULTS: z.infer<typeof legalInfoSchema> = {
  legal_name_ar: '',
  legal_name_en: '',
  registration_no: '',
  address: '',
  courts: 'طرابلس',
  retention_financial_years: null,
  retention_screenshots_days: 90,
  wrong_transfer_days: 14,
  privacy_reply_days: 30,
}

/** PUT /api/admin/settings/legal: publishes a new version. */
export const publishLegalSchema = legalInfoSchema.extend({
  /** A material change: users are asked to accept the new version when they next open the app. */
  material: z.boolean(),
})

/** GET /api/site/legal (public) */
export const legalResponseSchema = z.strictObject({
  /** 0 until the first publication. */
  version: z.number().int().min(0),
  published_at: timestamp.nullable(),
  /** Users who accepted an older version than this are asked to accept again. */
  acceptance_required_from: z.number().int().min(0),
  /** False while required fields are empty: the pages say "being prepared". */
  complete: z.boolean(),
  info: legalInfoSchema.extend({}).strict(),
})

/** POST /api/auth/me/accept-legal */
export const acceptLegalSchema = z.object({ version: z.number().int().min(1) })

/** GET /api/site/contact (public) and the admin settings */
export const contactResponseSchema = z.strictObject({ contact: contactSettingsSchema.extend({}).strict() })
export const generalRulesResponseSchema = z.strictObject({ rules: generalRulesSchema.extend({}).strict() })

/** GET /api/admin/audit-logs */
export const auditLogQuerySchema = z.object({
  /** "campaign" matches campaign.create, campaign.completed... */
  action: z.string().trim().regex(/^[a-z_.]{1,60}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().regex(/^\d+$/).optional(),
})
export const auditLogEntrySchema = z.strictObject({
  id: z.number().int(),
  created_at: timestamp,
  action: z.string(),
  entity: z.string(),
  entity_id: z.number().int().nullable(),
  actor_id: z.number().int().nullable(),
  actor_name: z.string().nullable(),
  actor_email: z.string().nullable(),
  actor_code: z.string().nullable(),
  before: z.unknown(),
  after: z.unknown(),
})
export const auditLogResponseSchema = z.strictObject({ results: z.array(auditLogEntrySchema), next_cursor: z.string().nullable() })

export type GeneralRules = z.infer<typeof generalRulesSchema>
export type ContactSettings = z.infer<typeof contactSettingsSchema>
export type LegalInfo = z.infer<typeof legalInfoSchema>
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>
