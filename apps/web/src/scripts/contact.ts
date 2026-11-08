import type { ContactSettings } from '@hufra/contracts'

import type { ContactMessages } from '../i18n/i18n'
import { el, getJson } from './api'

/** The contact page: each way to reach us appears only once it is set in the admin panel. */
export async function startContact() {
  const raw = document.getElementById('i18n')?.textContent
  if (!raw) return
  const { m } = JSON.parse(raw) as { m: ContactMessages }
  const status = document.querySelector<HTMLElement>('[data-contact-status]')
  const data = await getJson<{ contact: ContactSettings }>('/api/site/contact')
  if (!data) {
    if (status) (status.textContent = m['contact.unavailable']), (status.hidden = false)
    return
  }
  const c = data.contact
  const row = (key: string) => document.querySelector<HTMLElement>(`[data-row="${key}"]`)
  let shown = 0
  const link = (key: 'public_email' | 'privacy_email' | 'phone', value: string, hrefFor: (v: string) => string) => {
    const r = row(key)
    const a = r?.querySelector<HTMLAnchorElement>('[data-value]')
    if (!r || !a || !value) return
    a.href = hrefFor(value)
    a.textContent = value
    r.hidden = false
    shown++
  }
  link('public_email', c.public_email, (v) => `mailto:${v}`)
  link('privacy_email', c.privacy_email, (v) => `mailto:${v}`)
  link('phone', c.phone, (v) => `tel:${v.replace(/[^\d+]/g, '')}`)

  const social = row('social_links')
  const list = social?.querySelector('[data-value]')
  const links = c.social_links.filter((u) => /^https:\/\//.test(u))
  if (social && list && links.length) {
    for (const url of links) {
      const label = new URL(url).hostname.replace(/^www\./, '')
      list.append(el('li', {}, el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', dir: 'ltr', class: 'inline-flex min-h-11 items-center font-semibold' }, label, el('span', { class: 'sr-only' }, ` ${m['home.newWindow']}`))))
    }
    social.hidden = false
    shown++
  }
  if (!shown && status) (status.textContent = m['contact.none']), (status.hidden = false)
}
