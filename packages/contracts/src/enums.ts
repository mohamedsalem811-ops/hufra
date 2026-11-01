import { z } from 'zod'

export const userRoleSchema = z.enum(['user', 'admin', 'super_admin'])
export const localeSchema = z.enum(['ar', 'en'])
export const severitySchema = z.enum(['minor', 'medium', 'severe'])
export const potholeStatusSchema = z.enum(['reported', 'verified', 'under_repair', 'fixed'])
export const photoStageSchema = z.enum(['report', 'before', 'during', 'after'])
export const pushPlatformSchema = z.enum(['android', 'ios', 'web'])

export type UserRole = z.infer<typeof userRoleSchema>
export type Locale = z.infer<typeof localeSchema>
export type Severity = z.infer<typeof severitySchema>
export type PotholeStatus = z.infer<typeof potholeStatusSchema>
export type PhotoStage = z.infer<typeof photoStageSchema>
export type PushPlatform = z.infer<typeof pushPlatformSchema>

/** Report lifecycle order (see the status change rules in docs/ARCHITECTURE.md). */
export const STATUS_ORDER: readonly PotholeStatus[] = potholeStatusSchema.options
