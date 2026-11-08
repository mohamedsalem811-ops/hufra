// Admin panel shapes (plan 8.2): the report queue and the full report page.
import { z } from 'zod'

import { campaignStatusSchema, campaignSummarySchema } from './donations'
import { potholeStatusSchema, severitySchema } from './enums'
import { adminPotholeDetailSchema, photoSchema, statusHistoryEntrySchema } from './responses'

const id = z.number().int().positive()
const timestamp = z.string().min(10)
const nullableText = z.string().nullable()

export const reportQueueSortSchema = z.enum(['newest', 'oldest', 'most_confirmed'])

/** GET /api/admin/queue */
export const reportQueueQuerySchema = z.object({
  /** A report number (with or without #) or part of a street name. */
  q: z.string().trim().max(100).optional(),
  status: potholeStatusSchema.optional(),
  severity: severitySchema.optional(),
  region_id: z.coerce.number().int().positive().optional(),
  /** Only reports with a duplicate flag waiting for review. */
  duplicates: z.enum(['1']).optional(),
  sort: reportQueueSortSchema.default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(100).default(25),
})

export const reportQueueItemSchema = z.strictObject({
  id,
  status: potholeStatusSchema,
  severity: severitySchema,
  street_ar: nullableText,
  street_en: nullableText,
  region_id: id,
  region_name_ar: z.string(),
  region_name_en: z.string(),
  upvotes_count: z.number().int(),
  created_at: timestamp,
  cover_thumb_key: nullableText,
  duplicate_flag_count: z.number().int(),
  campaign: z
    .strictObject({ id, status: campaignStatusSchema, target_lyd: z.number(), confirmed_lyd: z.number() })
    .nullable(),
})

export const reportQueueResponseSchema = z.strictObject({
  results: z.array(reportQueueItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  page_size: z.number().int(),
})

/** GET /api/admin/reports/:id: everything the report page needs, in one call. */
export const adminReportResponseSchema = z.strictObject({
  pothole: adminPotholeDetailSchema,
  photos: z.array(photoSchema),
  history: z.array(statusHistoryEntrySchema.extend({ actor_name: nullableText })),
  /** Never shown to the public. Null for reports sent without an account. */
  reporter: z.strictObject({ id, code: z.string(), display_name: nullableText, email: z.string() }).nullable(),
  /** Possible duplicates waiting for review, in either direction. */
  duplicates: z.array(
    z.strictObject({
      flag_id: id,
      other_id: id,
      distance_m: z.number(),
      /** true when this report is the newer one (it is removed if the flag is confirmed). */
      this_is_newer: z.boolean(),
      other_status: potholeStatusSchema,
      other_street_ar: nullableText,
      other_street_en: nullableText,
      other_created_at: timestamp,
    }),
  ),
  /** The open campaign, or else the latest closed one. */
  campaign: campaignSummarySchema.nullable(),
})

export type ReportQueueQuery = z.input<typeof reportQueueQuerySchema>
export type ReportQueueItem = z.infer<typeof reportQueueItemSchema>
export type AdminReport = z.infer<typeof adminReportResponseSchema>

// ---------------------------------------------------------------- duplicates (8.2f)

const duplicateSideSchema = z.strictObject({
  id,
  status: potholeStatusSchema,
  severity: severitySchema,
  street_ar: nullableText,
  street_en: nullableText,
  region_name_ar: z.string(),
  region_name_en: z.string(),
  lat: z.number(),
  lng: z.number(),
  upvotes_count: z.number().int(),
  created_at: timestamp,
  cover_thumb_key: nullableText,
})

/** A pair the server found close together. Confirming removes the newer report. */
export const duplicateFlagSchema = z.strictObject({
  id,
  /** The newer report (removed when confirmed). */
  pothole_id: id,
  /** The older report it seems to repeat (kept). */
  duplicate_of_id: id,
  distance_m: z.number(),
  created_at: timestamp,
  newer: duplicateSideSchema,
  older: duplicateSideSchema,
})
export const duplicateListResponseSchema = z.strictObject({ results: z.array(duplicateFlagSchema) })

/** Numbers beside the menu items. */
export const adminCountsResponseSchema = z.strictObject({
  /** Reports still waiting for a first look (status "reported"). */
  new_reports: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  donations_to_review: z.number().int().nonnegative(),
  /** Unread notifications for the person signed in. */
  unread_notifications: z.number().int().nonnegative(),
})

export type DuplicateFlag = z.infer<typeof duplicateFlagSchema>
export type AdminCounts = z.infer<typeof adminCountsResponseSchema>

// ---------------------------------------------------------------- dashboard (8.2g)

export const DASHBOARD_PERIODS = [7, 30, 90, 365] as const
export const dashboardQuerySchema = z.object({
  days: z.coerce
    .number()
    .refine((d): d is (typeof DASHBOARD_PERIODS)[number] => (DASHBOARD_PERIODS as readonly number[]).includes(d))
    .default(30),
})

const count = z.number().int().nonnegative()

export const dashboardResponseSchema = z.strictObject({
  days: z.number().int(),
  tiles: z.strictObject({
    new_reports: count,
    /** The same number for the period just before, to compare. */
    new_reports_previous: count,
    awaiting_verification: count,
    oldest_waiting_at: timestamp.nullable(),
    under_repair: count,
    under_repair_regions: count,
    fixed: count,
    /** Days from report to repair, for repairs in the period. */
    avg_fix_days: z.number().nullable(),
    confirmed_lyd: z.number(),
    under_review_lyd: z.number(),
  }),
  /** New reports per week, oldest first; the last entry is the current week. */
  weekly: z.array(z.strictObject({ week_start: z.string(), count })),
  by_status: z.strictObject({ reported: count, verified: count, under_repair: count, fixed: count }),
  campaigns: z.strictObject({ open: count, missing_lyd: z.number() }),
  todo: z.strictObject({ stale_reports: count, donations_to_review: count, funded_campaigns: count, duplicates: count }),
  by_region: z.array(
    z.strictObject({ id, name_ar: z.string(), name_en: z.string(), open: count, fixed: count, avg_fix_days: z.number().nullable() })
  ),
})

export type DashboardQuery = z.input<typeof dashboardQuerySchema>
export type Dashboard = z.infer<typeof dashboardResponseSchema>
