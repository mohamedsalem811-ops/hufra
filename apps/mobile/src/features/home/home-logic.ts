import type { CountersResponse, PublicPotholeListItem } from '@hufra/contracts';

/** The three city numbers on the home card: waiting (reported + verified), under repair, fixed. */
export function cityNumbers(c: CountersResponse | undefined) {
  const t = c?.totals;
  return {
    waiting: (t?.reported ?? 0) + (t?.verified ?? 0),
    underRepair: t?.under_repair ?? 0,
    fixed: t?.fixed ?? 0,
  };
}

/** Open reports nearest first (the API sorts by distance; fixed ones are not "near you" news). */
export function nearbyOpen(results: readonly PublicPotholeListItem[], max = 3): PublicPotholeListItem[] {
  return results
    .filter((r) => r.status !== 'fixed')
    .sort((a, b) => (a.distance_m ?? Infinity) - (b.distance_m ?? Infinity))
    .slice(0, max);
}

/** "350 م" / "1.2 كم" (Western digits, VOICE.md). */
export function formatDistance(m: number, locale: 'ar' | 'en'): string {
  if (m < 1000) {
    const v = Math.max(10, Math.round(m / 10) * 10);
    return locale === 'ar' ? `${v} م` : `${v} m`;
  }
  const km = (Math.round(m / 100) / 10).toString();
  return locale === 'ar' ? `${km} كم` : `${km} km`;
}

/** "1,250 د.ل" / "LYD 1,250". */
export function formatLyd(amount: number, locale: 'ar' | 'en'): string {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(amount);
  return locale === 'ar' ? `${n} د.ل` : `LYD ${n}`;
}
