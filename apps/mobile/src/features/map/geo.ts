/** [longitude, latitude], as MapLibre uses it. */
export type LngLat = [number, number];
/** [west, south, east, north], as MapLibre uses it. */
export type Bounds = [number, number, number, number];

/** Greater Tripoli: where the map opens before we know where the person is. */
export const TRIPOLI_CENTER: LngLat = [13.1913, 32.8872];
export const DEFAULT_ZOOM = 12;
/** Libya, roughly: the camera is kept inside it. */
export const LIBYA_BOUNDS: Bounds = [9.3, 19.4, 25.2, 33.3];

/**
 * Bounds as the API wants them ("minLat,minLng,maxLat,maxLng"), grown by
 * `pad` on each side so a small pan does not need a new request, and rounded
 * so nearby viewports share one cached response.
 */
export function toBboxParam([west, south, east, north]: Bounds, pad = 0.25, decimals = 2): string {
  const dLng = (east - west) * pad;
  const dLat = (north - south) * pad;
  const f = 10 ** decimals;
  // The epsilon absorbs float noise (32.8 * 100 is 3279.9999…), so exact values are not rounded past.
  const down = (n: number) => Math.floor(n * f + 1e-9) / f;
  const up = (n: number) => Math.ceil(n * f - 1e-9) / f;
  return [down(south - dLat), down(west - dLng), up(north + dLat), up(east + dLng)].join(',');
}

export function isValidBounds(b: unknown): b is Bounds {
  return Array.isArray(b) && b.length === 4 && b.every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** A report the map should centre on and open (from "Open on map"). */
export interface MapFocus {
  id: number;
  lngLat: LngLat;
}

/** Route params -> focus, or null when missing or outside Libya. */
export function parseFocus(params: { focus?: string; lat?: string; lng?: string }): MapFocus | null {
  const id = Number(params.focus);
  const lat = Number(params.lat);
  const lng = Number(params.lng);
  if (!Number.isInteger(id) || id <= 0 || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const [west, south, east, north] = LIBYA_BOUNDS;
  if (lng < west || lng > east || lat < south || lat > north) return null;
  return { id, lngLat: [lng, lat] };
}
