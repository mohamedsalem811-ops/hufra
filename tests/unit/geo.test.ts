import { describe, it, expect } from 'vitest'
import {
  haversineDistanceMeters,
  boundingBoxForRadius,
  isPlausibleLibyaCoordinate,
  nearestRegion,
  DUPLICATE_RADIUS_METERS,
  toRadians,
} from '../../src/lib/geo'

describe('toRadians', () => {
  it('converts degrees to radians', () => {
    expect(toRadians(180)).toBeCloseTo(Math.PI, 10)
    expect(toRadians(0)).toBe(0)
  })
})

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical points', () => {
    const p = { lat: 32.8872, lng: 13.1913 }
    expect(haversineDistanceMeters(p, p)).toBeCloseTo(0, 5)
  })

  it('computes a known distance (Tripoli center to Tajoura, ~roughly 15-20km)', () => {
    const tripoliCenter = { lat: 32.8872, lng: 13.1913 }
    const tajoura = { lat: 32.8811, lng: 13.3502 }
    const d = haversineDistanceMeters(tripoliCenter, tajoura)
    // Real-world distance is ~15km; assert a sane range rather than an exact figure.
    expect(d).toBeGreaterThan(10000)
    expect(d).toBeLessThan(20000)
  })

  it('is symmetric', () => {
    const a = { lat: 32.8, lng: 13.0 }
    const b = { lat: 32.9, lng: 13.2 }
    expect(haversineDistanceMeters(a, b)).toBeCloseTo(haversineDistanceMeters(b, a), 6)
  })

  it('scales roughly linearly for small offsets on the same meridian', () => {
    const a = { lat: 32.0, lng: 13.0 }
    const b1 = { lat: 32.001, lng: 13.0 }
    const b2 = { lat: 32.002, lng: 13.0 }
    const d1 = haversineDistanceMeters(a, b1)
    const d2 = haversineDistanceMeters(a, b2)
    expect(d2).toBeCloseTo(d1 * 2, 0)
  })
})

describe('boundingBoxForRadius', () => {
  it('produces a box centered on the input point', () => {
    const center = { lat: 32.8872, lng: 13.1913 }
    const box = boundingBoxForRadius(center, 1000)
    expect(box.minLat).toBeLessThan(center.lat)
    expect(box.maxLat).toBeGreaterThan(center.lat)
    expect(box.minLng).toBeLessThan(center.lng)
    expect(box.maxLng).toBeGreaterThan(center.lng)
  })

  it('fully contains points within the radius (round-trip with haversine)', () => {
    const center = { lat: 32.8872, lng: 13.1913 }
    const radius = 500
    const box = boundingBoxForRadius(center, radius)
    // A point exactly at radius distance due north should sit at/inside the box lat bound.
    const north = { lat: center.lat + radius / 111320, lng: center.lng }
    expect(north.lat).toBeLessThanOrEqual(box.maxLat + 1e-6)
  })

  it('grows the box as radius increases', () => {
    const center = { lat: 32.8872, lng: 13.1913 }
    const small = boundingBoxForRadius(center, 100)
    const large = boundingBoxForRadius(center, 5000)
    expect(large.maxLat - large.minLat).toBeGreaterThan(small.maxLat - small.minLat)
  })
})

describe('isPlausibleLibyaCoordinate', () => {
  it('accepts coordinates within Libya bounding box', () => {
    expect(isPlausibleLibyaCoordinate({ lat: 32.8872, lng: 13.1913 })).toBe(true)
  })

  it('rejects coordinates far outside Libya', () => {
    expect(isPlausibleLibyaCoordinate({ lat: 51.5074, lng: -0.1278 })).toBe(false) // London
    expect(isPlausibleLibyaCoordinate({ lat: 0, lng: 0 })).toBe(false)
  })

  it('rejects non-finite values', () => {
    expect(isPlausibleLibyaCoordinate({ lat: NaN, lng: 13 })).toBe(false)
    expect(isPlausibleLibyaCoordinate({ lat: 32, lng: Infinity })).toBe(false)
  })

  it('rejects values just outside the boundary', () => {
    expect(isPlausibleLibyaCoordinate({ lat: 34.1, lng: 13 })).toBe(false)
    expect(isPlausibleLibyaCoordinate({ lat: 18.9, lng: 13 })).toBe(false)
  })
})

describe('nearestRegion', () => {
  const regions = [
    { id: 1, lat: 32.8811, lng: 13.3502 }, // Tajoura
    { id: 2, lat: 32.8756, lng: 13.2333 }, // Souq Al-Jumaa
    { id: 13, lat: 32.8872, lng: 13.1913 }, // Central Tripoli
  ]

  it('returns null for an empty region list', () => {
    expect(nearestRegion({ lat: 32.88, lng: 13.19 }, [])).toBeNull()
  })

  it('returns the closest region by id', () => {
    const nearest = nearestRegion({ lat: 32.887, lng: 13.19 }, regions)
    expect(nearest?.id).toBe(13)
  })

  it('picks Tajoura when point is near Tajoura', () => {
    const nearest = nearestRegion({ lat: 32.881, lng: 13.349 }, regions)
    expect(nearest?.id).toBe(1)
  })
})

describe('DUPLICATE_RADIUS_METERS', () => {
  it('is fixed at 50 meters per spec (section 10 duplicate-flagging)', () => {
    expect(DUPLICATE_RADIUS_METERS).toBe(50)
  })
})
