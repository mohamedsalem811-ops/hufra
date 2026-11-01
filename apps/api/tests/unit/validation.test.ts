import { describe, it, expect } from 'vitest'
import {
  registerSchema,
  loginSchema,
  createPotholeSchema,
  updateStatusSchema,
  listQuerySchema,
  regionSchema,
  photoMetaSchema,
} from '../../src/lib/validation'

describe('registerSchema', () => {
  it('accepts a valid registration payload', () => {
    const result = registerSchema.safeParse({
      email: 'User@Example.com',
      password: 'longenough123',
      locale: 'ar',
      display_name: 'Test User',
      consent: true,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.email).toBe('user@example.com') // lowercased
    }
  })

  it('rejects registration without consent', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'longenough123',
      consent: false,
    })
    expect(result.success).toBe(false)
  })

  it('rejects a short password', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'short',
      consent: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects an invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'longenough123',
      consent: true,
    })
    expect(result.success).toBe(false)
  })

  it('defaults locale to ar when omitted', () => {
    const result = registerSchema.safeParse({
      email: 'user@example.com',
      password: 'longenough123',
      consent: true,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.locale).toBe('ar')
  })
})

describe('loginSchema', () => {
  // NOTE: mandatory admin 2FA was cancelled per explicit user request; login
  // now only ever needs email + password. See docs/SECURITY.md.
  it('accepts a valid login payload', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com', password: 'x' })
    expect(result.success).toBe(true)
  })

  it('rejects a login payload missing the password', () => {
    const result = loginSchema.safeParse({ email: 'user@example.com' })
    expect(result.success).toBe(false)
  })
})

describe('createPotholeSchema', () => {
  const base = { lat: 32.8872, lng: 13.1913, severity: 'medium' as const }

  it('accepts a minimal valid report', () => {
    const result = createPotholeSchema.safeParse(base)
    expect(result.success).toBe(true)
  })

  it('rejects an invalid severity value', () => {
    const result = createPotholeSchema.safeParse({ ...base, severity: 'critical' })
    expect(result.success).toBe(false)
  })

  it('rejects out-of-range latitude', () => {
    const result = createPotholeSchema.safeParse({ ...base, lat: 200 })
    expect(result.success).toBe(false)
  })

  it('rejects out-of-range longitude', () => {
    const result = createPotholeSchema.safeParse({ ...base, lng: -200 })
    expect(result.success).toBe(false)
  })

  it('defaults description fields to empty string', () => {
    const result = createPotholeSchema.safeParse(base)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.description_ar).toBe('')
      expect(result.data.description_en).toBe('')
    }
  })

  it('accepts optional dimensions and region_id', () => {
    const result = createPotholeSchema.safeParse({
      ...base,
      region_id: 3,
      length_cm: 50,
      width_cm: 30,
      depth_cm: 10,
    })
    expect(result.success).toBe(true)
  })

  it('rejects negative dimensions', () => {
    const result = createPotholeSchema.safeParse({ ...base, length_cm: -5 })
    expect(result.success).toBe(false)
  })
})

describe('updateStatusSchema', () => {
  it('accepts a valid status transition', () => {
    expect(updateStatusSchema.safeParse({ status: 'verified' }).success).toBe(true)
  })

  it('rejects an invalid status value', () => {
    expect(updateStatusSchema.safeParse({ status: 'archived' }).success).toBe(false)
  })

  it('accepts an optional note', () => {
    expect(updateStatusSchema.safeParse({ status: 'fixed', note: 'Repaired by crew A' }).success).toBe(true)
  })
})

describe('listQuerySchema', () => {
  it('coerces string query params to numbers', () => {
    const result = listQuerySchema.safeParse({ region_id: '3', limit: '50', offset: '10' })
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.region_id).toBe(3)
      expect(result.data.limit).toBe(50)
      expect(result.data.offset).toBe(10)
    }
  })

  it('applies default limit/offset when omitted', () => {
    const result = listQuerySchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.limit).toBe(200)
      expect(result.data.offset).toBe(0)
    }
  })

  it('rejects a limit above the maximum', () => {
    const result = listQuerySchema.safeParse({ limit: '5000' })
    expect(result.success).toBe(false)
  })

  it('rejects radius_m below the 50m minimum', () => {
    const result = listQuerySchema.safeParse({ radius_m: '10' })
    expect(result.success).toBe(false)
  })
})

describe('regionSchema', () => {
  it('accepts a valid region', () => {
    const result = regionSchema.safeParse({
      slug: 'tajoura',
      name_ar: 'تاجوراء',
      name_en: 'Tajoura',
      center_lat: 32.8811,
      center_lng: 13.3502,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a slug with invalid characters', () => {
    const result = regionSchema.safeParse({
      slug: 'Tajoura City!',
      name_ar: 'تاجوراء',
      name_en: 'Tajoura',
      center_lat: 32.8811,
      center_lng: 13.3502,
    })
    expect(result.success).toBe(false)
  })

  it('defaults active to true', () => {
    const result = regionSchema.safeParse({
      slug: 'tajoura',
      name_ar: 'تاجوراء',
      name_en: 'Tajoura',
      center_lat: 32.8811,
      center_lng: 13.3502,
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.active).toBe(true)
  })
})

describe('photoMetaSchema', () => {
  it('defaults stage to report', () => {
    const result = photoMetaSchema.safeParse({})
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.stage).toBe('report')
  })

  it('accepts before/during/after stages', () => {
    for (const stage of ['before', 'during', 'after']) {
      expect(photoMetaSchema.safeParse({ stage }).success).toBe(true)
    }
  })

  it('rejects an invalid stage', () => {
    expect(photoMetaSchema.safeParse({ stage: 'unknown' }).success).toBe(false)
  })
})
