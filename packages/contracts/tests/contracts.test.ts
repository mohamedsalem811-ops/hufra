import { describe, it, expect } from 'vitest'
import {
  STATUS_ORDER,
  PHOTO_LIMITS,
  createPotholeSchema,
  emailSchema,
  listPotholesQuerySchema,
  passwordSchema,
  registerSchema,
  updateStatusSchema,
  publicPotholeListItemSchema,
  adminPotholeListItemSchema,
} from '../src'

describe('enums and limits', () => {
  it('status lifecycle order', () => {
    expect(STATUS_ORDER).toEqual(['reported', 'verified', 'under_repair', 'fixed'])
  })

  it('photo limits match what the server enforces (bytes, pixels, formats, no EXIF)', () => {
    expect(PHOTO_LIMITS).toMatchObject({
      maxPerStage: 3,
      types: ['image/webp', 'image/jpeg'],
      full: { maxBytes: 409600, maxLongEdgePx: 1280 },
      thumb: { maxBytes: 65536, maxLongEdgePx: 320 },
      exifAllowed: false,
    })
  })
})

describe('request schemas', () => {
  it('normalises emails (trim + lowercase)', () => {
    expect(emailSchema.parse('  Person@Example.COM ')).toBe('person@example.com')
  })

  it('password shape: 8 to 128 characters', () => {
    expect(passwordSchema.safeParse('short').success).toBe(false)
    expect(passwordSchema.safeParse('long-enough').success).toBe(true)
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false)
  })

  it('registration requires consent and defaults to Arabic', () => {
    expect(registerSchema.safeParse({ email: 'a@b.co', password: 'long-enough' }).success).toBe(false)
    expect(registerSchema.parse({ email: 'a@b.co', password: 'long-enough', consent: true }).locale).toBe('ar')
  })

  it('a report needs coordinates and a severity; text fields default to empty', () => {
    expect(createPotholeSchema.safeParse({ lat: 32.88, lng: 13.19 }).success).toBe(false)
    const parsed = createPotholeSchema.parse({ lat: 32.88, lng: 13.19, severity: 'severe' })
    expect(parsed).toMatchObject({ description_ar: '', street_ar: '' })
    expect(createPotholeSchema.safeParse({ lat: 32.88, lng: 13.19, severity: 'huge' }).success).toBe(false)
  })

  it('device ids for offline re-sends are restricted to safe characters', () => {
    const base = { lat: 32.88, lng: 13.19, severity: 'minor' as const }
    expect(createPotholeSchema.safeParse({ ...base, client_report_uuid: 'device-abc_123' }).success).toBe(true)
    expect(createPotholeSchema.safeParse({ ...base, client_report_uuid: "x'; DROP" }).success).toBe(false)
  })

  it('list queries coerce strings from the URL', () => {
    expect(listPotholesQuerySchema.parse({ region_id: '3', near_lat: '32.8', near_lng: '13.1', limit: '50' })).toMatchObject({
      region_id: 3,
      limit: 50,
      offset: 0,
    })
  })

  it('status changes only accept known statuses', () => {
    expect(updateStatusSchema.safeParse({ status: 'deleted' }).success).toBe(false)
  })
})

describe('response schemas', () => {
  const row = {
    id: 1, region_id: 2, lat: 32.8, lng: 13.1, length_cm: null, width_cm: null, depth_cm: null,
    severity: 'minor', status: 'reported', description_ar: '', description_en: '', street_ar: '', street_en: '',
    view_count: 0, upvotes_count: 0, created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z',
    verified_at: null, under_repair_at: null, fixed_at: null, deleted_at: null,
    region_name_ar: 'تاجوراء', region_name_en: 'Tajoura', cover_thumb_key: null,
  }

  it('the public report shape rejects private fields (strict)', () => {
    expect(publicPotholeListItemSchema.safeParse(row).success).toBe(true)
    expect(publicPotholeListItemSchema.safeParse({ ...row, reporter_contact: '+218' }).success).toBe(false)
  })

  it('the admin report shape includes them', () => {
    expect(adminPotholeListItemSchema.safeParse({ ...row, reporter_id: 5, reporter_contact: '+218', client_report_uuid: null }).success).toBe(true)
  })
})
