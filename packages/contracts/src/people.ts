// Admin panel shapes (plan 8.2e): admin accounts, regions with their workload,
// and the donor ranking.
import { z } from 'zod'

import { regionSchema } from './responses'

const id = z.number().int().positive()
const timestamp = z.string().min(10)
const regionIds = z.array(id).max(100)

const regionRefSchema = z.strictObject({ id, name_ar: z.string(), name_en: z.string() })

export const adminAccountSchema = z.strictObject({
  id,
  email: z.string(),
  display_name: z.string().nullable(),
  role: z.enum(['admin', 'super_admin']),
  code: z.string(),
  totp_enabled: z.boolean(),
  created_at: timestamp,
  last_login_at: timestamp.nullable(),
  suspended: z.boolean(),
  /** Empty for a super admin: they cover every region. */
  regions: z.array(regionRefSchema),
})

export const adminAccountListResponseSchema = z.strictObject({ results: z.array(adminAccountSchema) })
export const adminAccountResponseSchema = z.strictObject({ admin: adminAccountSchema })

/** Change an admin account. Send only what changes. */
export const updateAdminSchema = z
  .strictObject({
    role: z.enum(['admin', 'super_admin']).optional(),
    region_ids: regionIds.optional(),
    suspended: z.boolean().optional(),
  })
  .refine((v) => v.role !== undefined || v.region_ids !== undefined || v.suspended !== undefined, { message: 'Nothing to change' })

export const adminRegionSchema = regionSchema.extend({
  /** Reports not fixed yet. */
  open_reports: z.number().int().nonnegative(),
  total_reports: z.number().int().nonnegative(),
  /** Active admins assigned to this region (super admins are not counted). */
  admin_count: z.number().int().nonnegative(),
})
export const adminRegionListResponseSchema = z.strictObject({ results: z.array(adminRegionSchema) })

export const topDonorSchema = z.strictObject({
  /** null: the donor did not choose to show their name. */
  name: z.string().nullable(),
  /** Recorded by hand by the team (cash), not a reviewed transfer. */
  cash: z.boolean(),
  amount_millimes: z.number().int().positive(),
  donations: z.number().int().positive(),
})
export const topDonorsResponseSchema = z.strictObject({ results: z.array(topDonorSchema) })

export type AdminAccount = z.infer<typeof adminAccountSchema>
export type UpdateAdminInput = z.input<typeof updateAdminSchema>
export type AdminRegion = z.infer<typeof adminRegionSchema>
export type TopDonor = z.infer<typeof topDonorSchema>
