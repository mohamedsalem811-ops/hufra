import { API_URL } from '@/config/env';
import type { Locale } from '@/i18n/locale';

/** "1 نوفمبر 2026" / "1 November 2026": day month year, Western digits (VOICE.md). */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/** Public photo URL for a stored key (thumbnails and full photos are served from /media). */
export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `${API_URL}/media/${key.split('/').map(encodeURIComponent).join('/')}` : null;
}

/** Street in the current language, falling back to the other one, then the area. */
export function placeName(
  r: { street_ar: string | null; street_en: string | null; region_name_ar: string; region_name_en: string },
  locale: Locale,
): { street: string | null; area: string } {
  const street = locale === 'ar' ? r.street_ar ?? r.street_en : r.street_en ?? r.street_ar;
  return { street: street?.trim() || null, area: locale === 'ar' ? r.region_name_ar : r.region_name_en };
}
