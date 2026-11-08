import type { ContactSettings, LegalInfo } from '@hufra/contracts'

import type { Locale } from '../i18n/i18n'
import { countText, type Slot } from './content'

/** The value of each blank, or null where the owner has not filled it yet (the page shows a bracketed label). */
export function slotValues(locale: Locale, info: LegalInfo, contact?: Pick<ContactSettings, 'privacy_email' | 'public_email'>): Record<Slot, string | null> {
  const name = locale === 'ar' ? info.legal_name_ar || info.legal_name_en : info.legal_name_en || info.legal_name_ar
  return {
    name: name || null,
    address: info.address || null,
    reg: info.registration_no || null,
    courts: info.courts || null,
    fin: info.retention_financial_years === null ? null : countText(locale, info.retention_financial_years, 'year'),
    shots: countText(locale, info.retention_screenshots_days, 'day'),
    wrong: countText(locale, info.wrong_transfer_days, 'day'),
    reply: countText(locale, info.privacy_reply_days, 'day'),
    email: contact?.privacy_email || contact?.public_email || null,
  }
}

/** Splits "text {slot} text" into plain text and blanks. */
export function segments(text: string): ({ text: string } | { slot: Slot })[] {
  return text.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const m = /^\{(\w+)\}$/.exec(part)
    return m ? { slot: m[1] as Slot } : { text: part }
  })
}
