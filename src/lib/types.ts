// Shared domain types for HUFRA. Used by both API routes and frontend
// TypeScript modules (imported client-side only where bundled through Vite;
// plain browser JS files reference the same shapes informally in comments).

export type UserRole = 'user' | 'admin' | 'super_admin'
export type Locale = 'ar' | 'en'
export type Severity = 'minor' | 'medium' | 'severe'
export type PotholeStatus = 'reported' | 'verified' | 'under_repair' | 'fixed'
export type PhotoStage = 'report' | 'before' | 'during' | 'after'
export type PushPlatform = 'android' | 'ios' | 'web'

export interface Bindings {
  DB: D1Database
  PHOTOS: R2Bucket
  KV: KVNamespace
  JWT_SECRET: string
  ADMIN_WHATSAPP?: string
  PUSH_WEBHOOK_URL?: string
  FCM_SERVER_KEY?: string
  /** Optional tile URL template overriding OpenStreetMap, e.g. https://.../{z}/{x}/{y}.png?key=... */
  TILE_UPSTREAM?: string
  /** Extra origins allowed to call the API (comma-separated), e.g. a custom domain. See src/lib/origins.ts. */
  ALLOWED_ORIGINS?: string
}

export interface AuthContext {
  userId: number
  role: UserRole
  code: string
}

export interface RegionRow {
  id: number
  slug: string
  name_ar: string
  name_en: string
  city: string
  center_lat: number
  center_lng: number
  active: number
  created_at: string
}

export interface UserRow {
  id: number
  email: string
  password_hash: string
  role: UserRole
  code: string
  locale: Locale
  totp_secret: string | null
  totp_enabled: number
  display_name: string | null
  consent_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface PotholeRow {
  id: number
  region_id: number
  reporter_id: number | null
  reporter_contact: string | null
  client_report_uuid?: string | null
  lat: number
  lng: number
  length_cm: number | null
  width_cm: number | null
  depth_cm: number | null
  severity: Severity
  status: PotholeStatus
  description_ar: string | null
  description_en: string | null
  street_ar: string | null
  street_en: string | null
  view_count: number
  created_at: string
  updated_at: string
  verified_at: string | null
  under_repair_at: string | null
  fixed_at: string | null
  deleted_at: string | null
}

export interface PhotoRow {
  id: number
  pothole_id: number
  r2_key: string
  thumb_key: string
  stage: PhotoStage
  width_px: number | null
  height_px: number | null
  size_bytes: number | null
  exif_json: string | null
  uploaded_by: number | null
  created_at: string
  deleted_at: string | null
}

export interface DonorRow {
  id: number
  name: string
  amount_lyd: number
  note: string | null
  created_by: number | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface DevicePushTokenRow {
  id: number
  user_id: number
  platform: PushPlatform
  token: string
  endpoint_json: string | null
  locale: Locale
  active: number
  created_at: string
  updated_at: string
}

export const STATUS_ORDER: PotholeStatus[] = ['reported', 'verified', 'under_repair', 'fixed']

// Photo limits live in src/lib/storage.ts (MAX_PHOTOS_PER_STAGE, MAX_*_IMAGE_BYTES).
