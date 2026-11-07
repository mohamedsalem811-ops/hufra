import type { Locale } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'

type T = (key: MessageKey, vars?: Record<string, string | number>) => string

const DAY = 24 * 60 * 60 * 1000

/** Whole days since a time: "today", "1 day", "6 days". */
export function age(iso: string, t: T, now = Date.now()): string {
  const days = Math.max(0, Math.floor((now - Date.parse(iso)) / DAY))
  if (days === 0) return t('ago.today')
  if (days === 1) return t('ago.day')
  return t('ago.days', { n: days })
}

/** "7 Nov 2026, 10:12" with Western digits in both languages. */
export function dateTime(iso: string, locale: Locale, withTime = true): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}

/** The name in the current language, falling back to the other one. */
export function pick(locale: Locale, ar: string | null | undefined, en: string | null | undefined): string | null {
  return (locale === 'ar' ? ar || en : en || ar) || null
}

/** Photos are served by the same Worker under /media/<key>. */
export const mediaUrl = (key: string) => `/media/${key.split('/').map(encodeURIComponent).join('/')}`
