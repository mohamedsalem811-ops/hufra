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

describe('donations', () => {
  it('converts dinar to thousandths without float drift', async () => {
    const { lydToMillimes, millimesToLyd } = await import('../src/donations')
    expect(lydToMillimes(25.5)).toBe(25500)
    expect(lydToMillimes(0.1 + 0.2)).toBe(300)
    expect(millimesToLyd(25500)).toBe(25.5)
  })

  it('accepts at most 3 decimals for an amount', async () => {
    const { createDonationSchema } = await import('../src/donations')
    expect(createDonationSchema.safeParse({ amount_lyd: 10.125 }).success).toBe(true)
    expect(createDonationSchema.safeParse({ amount_lyd: 10.1255 }).success).toBe(false)
    expect(createDonationSchema.safeParse({ amount_lyd: 0.5 }).success).toBe(false)
    expect(createDonationSchema.parse({ amount_lyd: 50 })).toEqual({ amount_lyd: 50, show_name: false, method: 'bank_transfer' })
  })

  it('checks Libyan IBANs with mod 97', async () => {
    const { isValidLibyanIban } = await import('../src/donations')
    // ISO 13616 example IBAN for Libya.
    expect(isValidLibyanIban('LY83 0020 4800 0020 1001 2036 1')).toBe(true)
    expect(isValidLibyanIban('LY84002048000020100120361')).toBe(false)
    expect(isValidLibyanIban('GB82WEST12345698765432')).toBe(false)
  })

  it('only lets the website handoff land on our own paths', async () => {
    const { webHandoffSchema } = await import('../src/donations')
    expect(webHandoffSchema.safeParse({ next: '/donate/3' }).success).toBe(true)
    expect(webHandoffSchema.safeParse({ next: '//evil.example' }).success).toBe(false)
    expect(webHandoffSchema.safeParse({ next: 'https://evil.example' }).success).toBe(false)
    expect(webHandoffSchema.safeParse({ next: '/\\evil.example' }).success).toBe(false)
  })
})

describe('app additions', () => {
  it('compares versions by number', async () => {
    const { compareVersions } = await import('../src/app')
    expect(compareVersions('1.10.0', '1.2.9')).toBe(1)
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0)
    expect(compareVersions('0.9.9', '1.0.0')).toBe(-1)
  })

  it('reads paging parameters safely', async () => {
    const { pageQuerySchema } = await import('../src/app')
    expect(pageQuerySchema.parse({})).toEqual({ limit: 50 })
    expect(pageQuerySchema.parse({ limit: '10', cursor: '42' })).toEqual({ limit: 10, cursor: '42' })
    expect(pageQuerySchema.safeParse({ cursor: "1' OR 1=1" }).success).toBe(false)
    expect(pageQuerySchema.safeParse({ limit: '1000' }).success).toBe(false)
  })
})
