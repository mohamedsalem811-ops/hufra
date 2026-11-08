// App-facing additions (plan 7.1): paging, notification preferences, the
// app-version check and the shared-report payload.

import { z } from 'zod'
import { potholeStatusSchema, severitySchema } from './enums'

/** ?limit=&cursor= for long lists. The cursor is opaque: pass back next_cursor as is. */
export const pageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z
    .string()
    .regex(/^[1-9]\d{0,15}$/)
    .optional(),
})
export type PageQuery = z.infer<typeof pageQuerySchema>

/** null when there is nothing more to load. */
export const nextCursorSchema = z.string().nullable()

export const notificationPreferencesSchema = z.strictObject({
  /** Push when one of my reports changes status. */
  report_updates: z.boolean(),
  /** Push when one of my donations is confirmed or rejected. */
  donation_updates: z.boolean(),
})
export const updateNotificationPreferencesSchema = notificationPreferencesSchema.partial()
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>

export const appPlatformSchema = z.enum(['ios', 'android'])
const semver = z.string().regex(/^\d{1,4}\.\d{1,4}\.\d{1,4}$/, 'Use major.minor.patch, e.g. 1.2.0')

export const appVersionQuerySchema = z.object({ platform: appPlatformSchema, version: semver })

export const appVersionResponseSchema = z.strictObject({
  /** Newest published version. */
  latest: z.string(),
  /** Oldest version still allowed; older apps must update. */
  minimum: z.string(),
  update_required: z.boolean(),
  update_available: z.boolean(),
  /** Store page, once the app is published there. */
  store_url: z.string().nullable(),
})

export const appVersionSettingsSchema = z.object({
  ios: z.object({ latest: semver, minimum: semver, store_url: z.string().url().or(z.literal('')) }),
  android: z.object({ latest: semver, minimum: semver, store_url: z.string().url().or(z.literal('')) }),
})

/** Compare "1.2.10" and "1.10.0" by number, not text. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d !== 0) return d < 0 ? -1 : 1
  }
  return 0
}

/** GET /api/potholes/:id/share: what a shared link shows (and what link previews read). Never names the reporter. */
export const sharedReportResponseSchema = z.strictObject({
  id: z.number().int().positive(),
  /** The link to share: /r/<id> on the website. */
  url: z.string(),
  status: potholeStatusSchema,
  severity: severitySchema,
  street_ar: z.string().nullable(),
  street_en: z.string().nullable(),
  region_name_ar: z.string(),
  region_name_en: z.string(),
  created_at: z.string(),
  fixed_at: z.string().nullable(),
  upvotes_count: z.number().int().min(0),
  /** Thumbnail and full photo keys under /media: the "before" (or report) photo and, once fixed, the "after" photo. */
  photo_before: z.strictObject({ thumb_key: z.string(), r2_key: z.string() }).nullable(),
  photo_after: z.strictObject({ thumb_key: z.string(), r2_key: z.string() }).nullable(),
  campaign: z
    .strictObject({
      id: z.number().int(),
      status: z.string(),
      target_lyd: z.number(),
      confirmed_lyd: z.number(),
      /** Transfers waiting for review: shown apart, never counted as raised. */
      pending_lyd: z.number().default(0),
      donors: z.number().int().min(0).default(0),
    })
    .nullable(),
})
export type SharedReport = z.infer<typeof sharedReportResponseSchema>
