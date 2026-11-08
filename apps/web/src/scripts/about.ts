import type { PublicPartner } from '@hufra/contracts'

import { el, getJson, mediaUrl } from './api'

/** Partner logos on the about section (partners shown on the "about" page). */
export async function aboutPartners() {
  const list = document.querySelector<HTMLElement>('[data-about-partners]')
  if (!list) return
  const ar = list.dataset.locale !== 'en'
  const data = await getJson<{ results: PublicPartner[] }>('/api/partners?place=about')
  const partners = data?.results ?? []
  if (!partners.length) return
  document.querySelector('[data-about-partners-none]')?.setAttribute('hidden', '')
  for (const p of partners) {
    const name = (ar ? p.name_ar || p.name_en : p.name_en || p.name_ar) || ''
    const inner = p.logo_key
      ? el('img', { src: mediaUrl(p.logo_key), alt: name, loading: 'lazy', class: 'max-h-14 max-w-full object-contain' })
      : el('span', { class: 'text-center text-sm font-semibold' }, name)
    const box = p.website
      ? el('a', { href: p.website, target: '_blank', rel: 'noopener noreferrer', class: 'flex h-[88px] items-center justify-center rounded-2xl border border-default bg-white p-3 no-underline' }, inner)
      : el('div', { class: 'flex h-[88px] items-center justify-center rounded-2xl border border-default bg-white p-3' }, inner)
    list.append(el('li', {}, box))
  }
}
