// What the API sends back. The API's contract tests parse real responses with
// these schemas, so they cannot drift apart. Public report shapes are STRICT:
// an extra field (for example a leaked phone number) fails the tests.

import { z } from 'zod'
import { localeSchema, photoStageSchema, potholeStatusSchema, severitySchema, userRoleSchema } from './enums'

const id = z.number().int().positive()
const timestamp = z.string().min(10) // ISO-8601 from SQLite strftime
const nullableTimestamp = timestamp.nullable()
const nullableText = z.string().nullable()
const nullableNumber = z.number().nullable()
/** SQLite booleans arrive as 0/1. */
const flag = z.union([z.literal(0), z.literal(1)])

export const errorResponseSchema = z.looseObject({
  error: z.string(),
  error_ar: z.string().optional(),
})

// ---------------------------------------------------------------- regions

export const regionSchema = z.strictObject({
  id,
  slug: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
  city: z.string(),
  center_lat: z.number(),
  center_lng: z.number(),
  active: flag,
  created_at: timestamp,
})
export const regionListResponseSchema = z.strictObject({ results: z.array(regionSchema) })

// ---------------------------------------------------------------- reports

/** Columns of a report that anyone may see. Never includes who reported it. */
const publicPotholeFields = {
  id,
  region_id: id,
  lat: z.number(),
  lng: z.number(),
  length_cm: nullableNumber,
  width_cm: nullableNumber,
  depth_cm: nullableNumber,
  severity: severitySchema,
  status: potholeStatusSchema,
  description_ar: nullableText,
  description_en: nullableText,
  street_ar: nullableText,
  street_en: nullableText,
  view_count: z.number().int(),
  upvotes_count: z.number().int(),
  created_at: timestamp,
  updated_at: timestamp,
  verified_at: nullableTimestamp,
  under_repair_at: nullableTimestamp,
  fixed_at: nullableTimestamp,
  deleted_at: z.null(),
  region_name_ar: z.string(),
  region_name_en: z.string(),
}

/** Private columns: only admins, and the reporter for their own reports. */
const privatePotholeFields = {
  reporter_id: id.nullable(),
  reporter_contact: nullableText,
  client_report_uuid: nullableText,
}

/** A report in a public list or map (GET /api/potholes). */
export const publicPotholeListItemSchema = z.strictObject({
  ...publicPotholeFields,
  cover_thumb_key: nullableText,
  /** Present only for "near me" searches. */
  distance_m: z.number().optional(),
})
export const adminPotholeListItemSchema = publicPotholeListItemSchema.extend(privatePotholeFields)

export const potholeListResponseSchema = z.strictObject({
  results: z.array(z.union([publicPotholeListItemSchema, adminPotholeListItemSchema])),
  limit: z.number().int(),
  offset: z.number().int(),
})
/** Parse a list as seen by an anonymous user / citizen: private fields are rejected. */
export const publicPotholeListResponseSchema = z.strictObject({
  results: z.array(publicPotholeListItemSchema),
  limit: z.number().int(),
  offset: z.number().int(),
})

export const photoSchema = z.strictObject({
  id,
  thumb_key: z.string(),
  r2_key: z.string(),
  stage: photoStageSchema,
  created_at: timestamp,
})

export const statusHistoryEntrySchema = z.strictObject({
  from_status: potholeStatusSchema.nullable(),
  to_status: potholeStatusSchema,
  note: nullableText,
  at: timestamp,
})

export const publicPotholeDetailSchema = z.strictObject({ ...publicPotholeFields, region_slug: z.string() })
export const adminPotholeDetailSchema = publicPotholeDetailSchema.extend(privatePotholeFields)

/** GET /api/potholes/:id as seen by an anonymous user / citizen. */
export const publicPotholeDetailResponseSchema = z.strictObject({
  pothole: publicPotholeDetailSchema,
  photos: z.array(photoSchema),
  history: z.array(statusHistoryEntrySchema),
})
/** GET /api/potholes/:id as seen by an admin. */
export const adminPotholeDetailResponseSchema = publicPotholeDetailResponseSchema.extend({ pothole: adminPotholeDetailSchema })

/** GET /api/potholes/mine/list: the caller's own reports, including their own contact field. */
export const myPotholesResponseSchema = z.strictObject({
  results: z.array(z.strictObject({ ...publicPotholeFields, ...privatePotholeFields })),
})

export const createPotholeResponseSchema = z.strictObject({
  id,
  status: potholeStatusSchema,
  /** Short-lived permit for uploading this report's photos. */
  upload_token: z.string(),
  /** true when the same device already sent this report (offline re-send). */
  deduplicated: z.literal(true).optional(),
})

export const photoUploadResponseSchema = z.strictObject({
  id,
  r2_key: z.string(),
  thumb_key: z.string(),
  stage: photoStageSchema,
})

export const upvoteResponseSchema = z.strictObject({
  ok: z.literal(true),
  already_upvoted: z.boolean(),
  upvotes_count: z.number().int().min(0),
})

export const statusChangeResponseSchema = z.strictObject({
  ok: z.literal(true),
  status: potholeStatusSchema,
  previous_status: potholeStatusSchema,
})

// ---------------------------------------------------------------- homepage / transparency

export const countersResponseSchema = z.strictObject({
  totals: z.strictObject({
    total: z.number().int(),
    // SUM() is NULL when there are no reports yet
    fixed: nullableNumber,
    reported: nullableNumber,
    verified: nullableNumber,
    under_repair: nullableNumber,
  }),
  by_region: z.array(
    z.strictObject({ id, name_ar: z.string(), name_en: z.string(), total: z.number().int(), fixed: nullableNumber })
  ),
  avg_response_days: nullableNumber,
})

const showcaseItem = z.strictObject({
  id,
  status: potholeStatusSchema,
  street_ar: nullableText,
  street_en: nullableText,
  fixed_at: nullableTimestamp,
  under_repair_at: nullableTimestamp,
  created_at: timestamp,
  region_name_ar: z.string(),
  region_name_en: z.string(),
  before_thumb_key: nullableText,
  during_thumb_key: nullableText,
  after_thumb_key: nullableText,
})
export const showcaseResponseSchema = z.strictObject({ fixed: z.array(showcaseItem), in_progress: z.array(showcaseItem) })

export const recentFixedResponseSchema = z.strictObject({
  results: z.array(
    z.strictObject({
      id,
      street_ar: nullableText,
      street_en: nullableText,
      fixed_at: nullableTimestamp,
      created_at: timestamp,
      region_name_ar: z.string(),
      region_name_en: z.string(),
      before_thumb_key: nullableText,
      after_thumb_key: nullableText,
    })
  ),
})

export const topReporterResponseSchema = z.strictObject({
  reporter: z.strictObject({ name: z.string(), report_count: z.number().int() }).nullable(),
})

export const topDonorResponseSchema = z.strictObject({
  donor: z.strictObject({ id, name: z.string(), amount_lyd: z.number(), note: nullableText }).nullable(),
})

// ---------------------------------------------------------------- accounts

export const sessionUserSchema = z.strictObject({
  id,
  email: z.string(),
  code: z.string(),
  role: userRoleSchema,
  locale: localeSchema,
  display_name: nullableText,
})

/**
 * POST /api/auth/login. Tokens are present only for the native app and API
 * clients; web pages get HttpOnly cookies instead (tokensInBody in the API).
 */
export const loginResponseSchema = z.strictObject({
  user: sessionUserSchema,
  access_token: z.string().optional(),
  refresh_token: z.string().optional(),
})

export const registerResponseSchema = z.strictObject({ user: sessionUserSchema.omit({ display_name: true }) })

/** POST /api/auth/refresh: new tokens (native app) or just ok (web, cookies). */
export const refreshResponseSchema = z.union([
  z.strictObject({ access_token: z.string(), refresh_token: z.string() }),
  z.strictObject({ ok: z.literal(true) }),
])

export const meResponseSchema = z.strictObject({
  user: sessionUserSchema.extend({ totp_enabled: flag, created_at: timestamp }),
})

export const notificationSchema = z.strictObject({
  id,
  target_role: z.enum(['admin', 'super_admin']).nullable(),
  target_user_id: id.nullable(),
  type: z.string(),
  /** JSON string with the bilingual copy (title_ar/en, body_ar/en, url) and ids. */
  payload_json: z.string(),
  created_at: timestamp,
  read_at: nullableTimestamp,
})
export const notificationListResponseSchema = z.strictObject({
  results: z.array(notificationSchema),
  unread_count: z.number().int().min(0),
})

export const okResponseSchema = z.looseObject({ ok: z.literal(true) })

// ---------------------------------------------------------------- inferred types

export type Region = z.infer<typeof regionSchema>
export type PublicPotholeListItem = z.infer<typeof publicPotholeListItemSchema>
export type AdminPotholeListItem = z.infer<typeof adminPotholeListItemSchema>
export type PublicPotholeDetail = z.infer<typeof publicPotholeDetailSchema>
export type AdminPotholeDetail = z.infer<typeof adminPotholeDetailSchema>
export type PotholeDetailResponse = z.infer<typeof publicPotholeDetailResponseSchema>
export type Photo = z.infer<typeof photoSchema>
export type StatusHistoryEntry = z.infer<typeof statusHistoryEntrySchema>
export type CreatePotholeResponse = z.infer<typeof createPotholeResponseSchema>
export type PhotoUploadResponse = z.infer<typeof photoUploadResponseSchema>
export type UpvoteResponse = z.infer<typeof upvoteResponseSchema>
export type StatusChangeResponse = z.infer<typeof statusChangeResponseSchema>
export type CountersResponse = z.infer<typeof countersResponseSchema>
export type ShowcaseResponse = z.infer<typeof showcaseResponseSchema>
export type RecentFixedResponse = z.infer<typeof recentFixedResponseSchema>
export type TopReporterResponse = z.infer<typeof topReporterResponseSchema>
export type TopDonorResponse = z.infer<typeof topDonorResponseSchema>
export type SessionUser = z.infer<typeof sessionUserSchema>
export type LoginResponse = z.infer<typeof loginResponseSchema>
export type RefreshResponse = z.infer<typeof refreshResponseSchema>
export type MeResponse = z.infer<typeof meResponseSchema>
export type Notification = z.infer<typeof notificationSchema>
export type NotificationListResponse = z.infer<typeof notificationListResponseSchema>
export type ErrorResponse = z.infer<typeof errorResponseSchema>
