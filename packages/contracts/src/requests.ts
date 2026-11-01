// Request bodies and query strings accepted by the API. The server validates
// with these exact schemas; the apps use them (or their inferred types) to
// build requests, so both sides always agree.

import { z } from 'zod'
import { localeSchema, photoStageSchema, potholeStatusSchema, pushPlatformSchema, severitySchema } from './enums'
import { PASSWORD_LIMITS, RADIUS_LIMITS, TEXT_LIMITS } from './limits'

export const emailSchema = z.string().trim().toLowerCase().email().max(200)

/**
 * Shape-only password rule. The server adds policy on top (e.g. refusing
 * passwords that are publicly known); see apps/api/src/lib/validation.ts.
 */
export const passwordSchema = z.string().min(PASSWORD_LIMITS.minLength).max(PASSWORD_LIMITS.maxLength)

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema.default('ar'),
  display_name: z.string().trim().min(1).max(TEXT_LIMITS.displayName).optional(),
  consent: z.literal(true, { error: 'Consent is required to register' }),
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_LIMITS.maxLength),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(PASSWORD_LIMITS.maxLength),
  new_password: passwordSchema,
})

const optionalText = (max: number) => z.string().trim().max(max).optional().default('')
const dimension = z.number().min(0).max(10000).optional()

export const createPotholeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  region_id: z.number().int().positive().optional(),
  severity: severitySchema,
  description_ar: optionalText(TEXT_LIMITS.description),
  description_en: optionalText(TEXT_LIMITS.description),
  street_ar: optionalText(TEXT_LIMITS.street),
  street_en: optionalText(TEXT_LIMITS.street),
  length_cm: dimension,
  width_cm: dimension,
  depth_cm: dimension,
  reporter_contact: z.string().trim().max(TEXT_LIMITS.contact).optional(),
  /** Device-generated id that makes offline re-sends idempotent. */
  client_report_uuid: z
    .string()
    .trim()
    .min(8)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
})

export const updateStatusSchema = z.object({
  status: potholeStatusSchema,
  note: z.string().trim().max(TEXT_LIMITS.statusNote).optional(),
})

export const listPotholesQuerySchema = z.object({
  status: potholeStatusSchema.optional(),
  region_id: z.coerce.number().int().positive().optional(),
  severity: severitySchema.optional(),
  /** "minLat,minLng,maxLat,maxLng" */
  bbox: z.string().optional(),
  near_lat: z.coerce.number().min(-90).max(90).optional(),
  near_lng: z.coerce.number().min(-180).max(180).optional(),
  radius_m: z.coerce.number().min(RADIUS_LIMITS.min).max(RADIUS_LIMITS.max).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
})

export const regionInputSchema = z.object({
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9-]+$/),
  name_ar: z.string().trim().min(1).max(120),
  name_en: z.string().trim().min(1).max(120),
  center_lat: z.number().min(-90).max(90),
  center_lng: z.number().min(-180).max(180),
  active: z.boolean().default(true),
})

export const donorInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount_lyd: z.number().positive().max(100000000),
  note: z.string().trim().max(300).optional(),
})

export const photoMetaSchema = z.object({
  stage: photoStageSchema.default('report'),
  width_px: z.number().int().positive().optional(),
  height_px: z.number().int().positive().optional(),
})

export const pushTokenSchema = z.object({
  platform: pushPlatformSchema,
  token: z.string().trim().min(8).max(2048),
  endpoint_json: z.string().trim().max(4096).optional(),
  locale: localeSchema.default('ar'),
})

export const duplicateReviewSchema = z.object({ decision: z.enum(['confirmed', 'rejected']) })
export const promoteAdminSchema = z.object({ email: emailSchema, role: z.enum(['admin', 'super_admin']) })
export const demoteAdminSchema = z.object({ email: emailSchema })

export type RegisterInput = z.input<typeof registerSchema>
export type LoginInput = z.input<typeof loginSchema>
export type ChangePasswordInput = z.input<typeof changePasswordSchema>
export type CreatePotholeInput = z.input<typeof createPotholeSchema>
export type UpdateStatusInput = z.input<typeof updateStatusSchema>
export type ListPotholesQuery = z.input<typeof listPotholesQuerySchema>
export type RegionInput = z.input<typeof regionInputSchema>
export type DonorInput = z.input<typeof donorInputSchema>
export type PushTokenInput = z.input<typeof pushTokenSchema>
