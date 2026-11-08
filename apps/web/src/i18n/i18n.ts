import { ar, en, type MessageKey } from './messages'

export type Locale = 'ar' | 'en'
export const LOCALES: Locale[] = ['ar', 'en']

const dict = { ar, en } as const

export function t(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const text: string = dict[locale][key]
  return vars ? text.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : text
}

/** A site path in a language: Arabic has no prefix, English lives under /en. */
export function href(locale: Locale, path: string): string {
  const clean = path.startsWith('/') ? path : `/${path}`
  if (locale === 'ar') return clean
  return clean === '/' ? '/en/' : `/en${clean}`
}

/** The same page in the other language. */
export function otherPath(locale: Locale, pathname: string): string {
  const bare = pathname.replace(/^\/en(?=\/|$)/, '') || '/'
  return href(locale === 'ar' ? 'en' : 'ar', bare)
}

/** The strings a page's browser script needs, for one language (sent as JSON, kept small). */
export function pickMessages<K extends MessageKey>(locale: Locale, keys: readonly K[]): Record<K, string> {
  return Object.fromEntries(keys.map((k) => [k, dict[locale][k]])) as Record<K, string>
}

export const HOME_KEYS = [
  'money.lyd', 'unit.days', 'home.numbersUnavailable', 'home.before', 'home.after', 'home.beforeAlt', 'home.afterAlt', 'home.fixedIn',
  'home.fixedSameDay', 'home.raised', 'home.raisedAlt', 'home.donors', 'home.featured', 'home.partnerFixed', 'home.partnerLyd',
  'home.partnerFixedN', 'home.visit', 'home.newWindow', 'home.logoAlt', 'home.noStreet', 'kind.repair_sponsor', 'kind.government', 'kind.tech', 'kind.media',
] as const satisfies readonly MessageKey[]
export type ClientMessages = Record<(typeof HOME_KEYS)[number], string>

export const TRANSPARENCY_KEYS = [
  'money.lyd', 'tr.updated', 'tr.fixedPct', 'tr.monthlyAlt', 'tr.asTable', 'tr.asChart', 'tr.month', 'tr.fixedCol', 'tr.noReports',
  'tr.receiptView', 'tr.receiptAlt', 'tr.diffMoved', 'tr.diffOver', 'tr.noCompleted', 'tr.unavailable', 'unit.days', 'home.noStreet', 'home.newWindow',
] as const satisfies readonly MessageKey[]
export type TransparencyMessages = Record<(typeof TRANSPARENCY_KEYS)[number], string>

export const CONTACT_KEYS = ['contact.none', 'contact.unavailable', 'home.newWindow'] as const satisfies readonly MessageKey[]
export type ContactMessages = Record<(typeof CONTACT_KEYS)[number], string>
