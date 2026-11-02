import type { Photo, PotholeDetailResponse, PotholeStatus, StatusHistoryEntry } from '@hufra/contracts';

import { API_URL } from '@/config/env';
import type { Locale } from '@/i18n/locale';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Photos shown in the gallery: what the reporter and the team saw before the repair. */
export function galleryPhotos(photos: readonly Photo[]): Photo[] {
  return photos.filter((p) => p.stage !== 'after');
}

/**
 * The pair for the before/after slider (design board 4, screen 1): the team's
 * "before" photo, else the first report photo; and the latest "after" photo.
 * null when the report has no after photo yet.
 */
export function beforeAfterPair(photos: readonly Photo[]): { before: Photo; after: Photo } | null {
  const after = photos.filter((p) => p.stage === 'after').at(-1);
  const before = photos.find((p) => p.stage === 'before') ?? photos.find((p) => p.stage === 'report');
  return after && before ? { before, after } : null;
}

export interface TimelineEntry {
  status: PotholeStatus;
  at: string;
  note: string | null;
}

/**
 * Status changes, newest first. Uses the recorded history; reports older than
 * the history table fall back to the dates stored on the report itself.
 */
export function timeline(detail: Pick<PotholeDetailResponse, 'pothole' | 'history'>): TimelineEntry[] {
  const fromHistory: TimelineEntry[] = detail.history.map((h: StatusHistoryEntry) => ({
    status: h.to_status,
    at: h.at,
    note: h.note?.trim() || null,
  }));
  const entries = fromHistory.length
    ? fromHistory
    : (
        [
          ['reported', detail.pothole.created_at],
          ['verified', detail.pothole.verified_at],
          ['under_repair', detail.pothole.under_repair_at],
          ['fixed', detail.pothole.fixed_at],
        ] as const
      )
        .filter((e): e is readonly [PotholeStatus, string] => !!e[1])
        .map(([status, at]) => ({ status, at, note: null }));
  return [...entries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Whole days from a to b (never negative); NaN-safe. */
export function daysBetween(a: string, b: string): number {
  const diff = Date.parse(b) - Date.parse(a);
  return Number.isFinite(diff) ? Math.max(0, Math.floor(diff / DAY_MS)) : 0;
}

/**
 * "3 أيام", "11 يوماً", "يومين", "1 day"... Arabic counts change the noun's form
 * (1, 2, 3-10, 11+), so this is not a simple {n} placeholder.
 */
export function daysText(n: number, locale: Locale): string {
  if (locale === 'en') return n === 1 ? '1 day' : `${n} days`;
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومين';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}

/** Public web address of a report, used for sharing. */
export function shareUrl(id: number): string {
  return `${API_URL}/pothole/${id}`;
}

/** Directions to a point, per maps app. Android's geo: lets the person pick any installed maps app. */
export function directionsUrls(lat: number, lng: number, label: string) {
  const at = `${lat.toFixed(6)},${lng.toFixed(6)}`;
  return {
    android: `geo:${at}?q=${at}(${encodeURIComponent(label)})`,
    apple: `maps://?daddr=${at}&dirflg=d`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${at}`,
  };
}
