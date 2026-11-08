import type { ContactSettings, LegalInfo } from '@hufra/contracts'

import type { Locale } from '../i18n/i18n'
import { slotValues } from '../legal/slots'
import { fill, getJson } from './api'

interface LegalState {
  version: number
  published_at: string | null
  complete: boolean
  info: LegalInfo
}

/** Fills the legal pages' blanks with the published information; the draft note goes once it is complete. */
export async function startLegal() {
  const raw = document.getElementById('i18n')?.textContent
  if (!raw) return
  const { locale, updated } = JSON.parse(raw) as { locale: Locale; updated: string }
  const [legal, contact] = await Promise.all([
    getJson<LegalState>('/api/site/legal'),
    getJson<{ contact: ContactSettings }>('/api/site/contact'),
  ])
  if (!legal) return
  const values = slotValues(locale, legal.info, contact?.contact)

  for (const node of document.querySelectorAll<HTMLElement>('[data-slot]')) {
    const v = values[node.dataset.slot as keyof typeof values]
    if (!v) continue
    if (node instanceof HTMLAnchorElement) {
      node.href = `mailto:${v}`
      node.dir = 'ltr'
    }
    node.textContent = v
    node.removeAttribute('data-missing')
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-if]')) {
    node.hidden = !values[node.dataset.if as keyof typeof values]
  }
  document.querySelector<HTMLElement>('[data-draft]')?.toggleAttribute('hidden', legal.complete)

  const line = document.querySelector<HTMLElement>('[data-updated]')
  if (line && legal.version > 0 && legal.published_at) {
    const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', { dateStyle: 'long' }).format(new Date(legal.published_at))
    line.textContent = fill(updated, { date, v: legal.version })
    line.hidden = false
  }
}
