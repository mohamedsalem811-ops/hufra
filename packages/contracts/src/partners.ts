// Plan 8.2: partners, managed in the admin panel and shown on the website,
// in the app and on the campaigns they fund.
import { z } from 'zod'

const id = z.number().int().positive()
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD')
const money = z.number().min(0)

export const partnerKindSchema = z.enum(['repair_sponsor', 'government', 'tech', 'media'])
export const partnerPlaceSchema = z.enum(['home', 'about', 'app'])

export const PARTNER_LOGO = { maxBytes: 300 * 1024, maxLongEdgePx: 1024, minLongEdgePx: 128 } as const

/** POST/PUT /api/admin/partners */
export const partnerInputSchema = z
  .object({
    name_ar: z.string().trim().min(1).max(120),
    name_en: z.string().trim().min(1).max(120),
    description_ar: z.string().trim().max(160),
    description_en: z.string().trim().max(160),
    website: z.union([z.literal(''), z.string().trim().url().max(300).refine((u) => /^https:\/\//.test(u), 'Use an https:// link')]),
    kind: partnerKindSchema,
    starts_on: day.nullable(),
    ends_on: day.nullable(),
    show_home: z.boolean(),
    show_about: z.boolean(),
    show_app: z.boolean(),
    show_campaigns: z.boolean(),
    /** Only one partner is featured: choosing one un-features the others. */
    featured: z.boolean(),
    visible: z.boolean(),
  })
  .refine((p) => !p.starts_on || !p.ends_on || p.starts_on <= p.ends_on, { message: 'The end date is before the start date', path: ['ends_on'] })

/** Counted from the completed campaigns linked to the partner: never typed by hand. */
const funded = { funded_count: z.number().int().min(0), funded_lyd: money }

export const adminPartnerSchema = z.strictObject({
  id,
  name_ar: z.string(),
  name_en: z.string(),
  description_ar: z.string(),
  description_en: z.string(),
  website: z.string(),
  kind: partnerKindSchema,
  logo_key: z.string().nullable(),
  starts_on: day.nullable(),
  ends_on: day.nullable(),
  show_home: z.boolean(),
  show_about: z.boolean(),
  show_app: z.boolean(),
  show_campaigns: z.boolean(),
  featured: z.boolean(),
  visible: z.boolean(),
  sort_order: z.number().int(),
  /** Shown to the public today (visible and within its dates). */
  live: z.boolean(),
  ...funded,
})
export const adminPartnerListResponseSchema = z.strictObject({ results: z.array(adminPartnerSchema) })
export const adminPartnerResponseSchema = z.strictObject({ partner: adminPartnerSchema })
export const partnerOrderSchema = z.object({ ids: z.array(id).min(1).max(200) })

/** GET /api/partners?place=home|about|app (public) */
export const publicPartnerSchema = z.strictObject({
  id,
  name_ar: z.string(),
  name_en: z.string(),
  description_ar: z.string(),
  description_en: z.string(),
  website: z.string(),
  kind: partnerKindSchema,
  logo_key: z.string().nullable(),
  featured: z.boolean(),
  ...funded,
})
export const publicPartnerListResponseSchema = z.strictObject({ results: z.array(publicPartnerSchema) })

/** "Supported by" on a campaign card. */
export const campaignPartnerSchema = z.strictObject({ id, name_ar: z.string(), name_en: z.string(), logo_key: z.string().nullable() })

export type PartnerInput = z.input<typeof partnerInputSchema>
export type AdminPartner = z.infer<typeof adminPartnerSchema>
export type PublicPartner = z.infer<typeof publicPartnerSchema>
