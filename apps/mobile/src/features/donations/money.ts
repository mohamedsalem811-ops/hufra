import type { Locale } from '@/i18n/locale';

/** "1,250.5 د.ل" / "LYD 1,250.5": dinar, Western digits, up to 3 decimals. */
export function formatLyd(amount: number, locale: Locale): string {
  const n = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(amount);
  return locale === 'ar' ? `${n} د.ل` : `LYD ${n}`;
}

/** Widths (0-100) of the confirmed and under-review parts of the progress bar. */
export function barParts(target: number, confirmed: number, underReview: number) {
  if (!(target > 0)) return { confirmed: 0, underReview: 0 };
  const c = Math.min(100, (confirmed / target) * 100);
  return { confirmed: c, underReview: Math.min(100 - c, (underReview / target) * 100) };
}
