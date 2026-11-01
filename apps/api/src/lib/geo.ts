// Geospatial helpers for HUFRA.
//
// ASSUMPTION: Cloudflare D1 (SQLite) has no native geometry/geography type and
// no spatial index extension available in the Workers runtime. We therefore
// store plain `lat`/`lng` REAL columns with a composite index (see
// migrations/0001_initial_schema.sql: idx_potholes_geo) and perform:
//   1. A cheap bounding-box pre-filter in SQL (uses the index, narrows rows).
//   2. An exact Haversine distance calculation in application code on the
//      (small) pre-filtered result set.
// This gives "near me" / radius search behavior equivalent in outcome to a
// PostGIS ST_DWithin query, at a scale appropriate for a single city.

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6371000

export function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/** Great-circle distance between two points, in meters. */
export function haversineDistanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat)
  const dLng = toRadians(b.lng - a.lng)
  const lat1 = toRadians(a.lat)
  const lat2 = toRadians(b.lat)

  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h =
    sinDLat * sinDLat +
    Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng

  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  return EARTH_RADIUS_M * c
}

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/**
 * Compute a bounding box that fully contains a circle of `radiusMeters`
 * centered at `center`. Used to pre-filter rows in SQL with a cheap
 * `WHERE lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?` before the exact
 * Haversine filter is applied in application code.
 */
export function boundingBoxForRadius(center: LatLng, radiusMeters: number): BoundingBox {
  const latDelta = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI)
  const lngDelta =
    (radiusMeters / (EARTH_RADIUS_M * Math.cos(toRadians(center.lat)))) * (180 / Math.PI)

  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  }
}

/** Validate that coordinates are roughly within Libya's bounding box.
 * Loose sanity check only - not a strict geofence - so legitimate edge
 * reports near the coverage boundary are never rejected outright. */
export function isPlausibleLibyaCoordinate(point: LatLng): boolean {
  return (
    point.lat >= 19 &&
    point.lat <= 34 &&
    point.lng >= 9 &&
    point.lng <= 26 &&
    Number.isFinite(point.lat) &&
    Number.isFinite(point.lng)
  )
}

/** Find the nearest region center to a given point (simple linear scan;
 * region count is small - under 30 - so this is fast enough at any scale). */
export function nearestRegion<T extends LatLng & { id: number }>(
  point: LatLng,
  regions: T[]
): T | null {
  if (regions.length === 0) return null
  let best = regions[0]
  let bestDist = haversineDistanceMeters(point, best)
  for (let i = 1; i < regions.length; i++) {
    const d = haversineDistanceMeters(point, regions[i])
    if (d < bestDist) {
      bestDist = d
      best = regions[i]
    }
  }
  return best
}

/** Duplicate-detection radius in meters (section 10: "~50m"). */
export const DUPLICATE_RADIUS_METERS = 50
