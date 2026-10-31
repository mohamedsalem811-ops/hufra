import { z } from 'zod'

export const emailSchema = z.string().trim().toLowerCase().email().max(200)
export const passwordSchema = z.string().min(8).max(128)

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  locale: z.enum(['ar', 'en']).default('ar'),
  display_name: z.string().trim().min(1).max(80).optional(),
  consent: z.literal(true, {
    error: 'Consent is required to register',
  }),
})

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
})

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export const createPotholeSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  region_id: z.number().int().positive().optional(),
  severity: z.enum(['minor', 'medium', 'severe']),
  description_ar: z.string().trim().max(1000).optional().default(''),
  description_en: z.string().trim().max(1000).optional().default(''),
  street_ar: z.string().trim().max(200).optional().default(''),
  street_en: z.string().trim().max(200).optional().default(''),
  length_cm: z.number().min(0).max(10000).optional(),
  width_cm: z.number().min(0).max(10000).optional(),
  depth_cm: z.number().min(0).max(10000).optional(),
  reporter_contact: z.string().trim().max(120).optional(),
  client_report_uuid: z
    .string()
    .trim()
    .min(8)
    .max(100)
    .regex(/^[a-zA-Z0-9_-]+$/)
    .optional(),
})

export const updateStatusSchema = z.object({
  status: z.enum(['reported', 'verified', 'under_repair', 'fixed']),
  note: z.string().trim().max(500).optional(),
})

export const listQuerySchema = z.object({
  status: z.enum(['reported', 'verified', 'under_repair', 'fixed']).optional(),
  region_id: z.coerce.number().int().positive().optional(),
  severity: z.enum(['minor', 'medium', 'severe']).optional(),
  bbox: z.string().optional(), // "minLat,minLng,maxLat,maxLng"
  near_lat: z.coerce.number().min(-90).max(90).optional(),
  near_lng: z.coerce.number().min(-180).max(180).optional(),
  radius_m: z.coerce.number().min(50).max(50000).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  offset: z.coerce.number().int().min(0).default(0),
})

export const regionSchema = z.object({
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

export const donorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amount_lyd: z.number().positive().max(100000000),
  note: z.string().trim().max(300).optional(),
})

export const photoMetaSchema = z.object({
  stage: z.enum(['report', 'before', 'during', 'after']).default('report'),
  width_px: z.number().int().positive().optional(),
  height_px: z.number().int().positive().optional(),
})

export const pushTokenSchema = z.object({
  platform: z.enum(['android', 'ios', 'web']),
  token: z.string().trim().min(8).max(2048),
  endpoint_json: z.string().trim().max(4096).optional(),
  locale: z.enum(['ar', 'en']).default('ar'),
})
