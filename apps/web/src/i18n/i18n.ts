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

/** Every string the browser scripts need, for one language (kept small). */
export function clientMessages(locale: Locale) {
  const keys = [
    'money.lyd', 'unit.days', 'home.numbersUnavailable', 'home.before', 'home.after', 'home.beforeAlt', 'home.afterAlt', 'home.fixedIn',
    'home.fixedSameDay', 'home.raised', 'home.raisedAlt', 'home.donors', 'home.featured', 'home.partnerFixed', 'home.partnerLyd',
    'home.partnerFixedN', 'home.visit', 'home.newWindow', 'home.logoAlt', 'home.noStreet', 'kind.repair_sponsor', 'kind.government', 'kind.tech', 'kind.media',
  ] as const satisfies readonly MessageKey[]
  return Object.fromEntries(keys.map((k) => [k, dict[locale][k]])) as Record<(typeof keys)[number], string>
}
export type ClientMessages = ReturnType<typeof clientMessages>
