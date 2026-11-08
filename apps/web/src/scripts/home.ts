import type { CampaignSummary, PublicPartner, ShowcaseResponse, SiteNumbers } from '@hufra/contracts'

import type { ClientMessages, Locale } from '../i18n/i18n'
import { el, fill, getJson, mediaUrl } from './api'

type Ctx = { locale: Locale; m: ClientMessages; num: (n: number) => string }
const DAY = 86400000

const pick = (locale: Locale, ar: string | null | undefined, en: string | null | undefined) => (locale === 'ar' ? ar || en : en || ar) || ''
const show = (selector: string) => document.querySelector<HTMLElement>(selector)?.removeAttribute('hidden')

export function startHome() {
  const data = document.getElementById('i18n')?.textContent
  if (!data) return
  const { locale, m } = JSON.parse(data) as { locale: Locale; m: ClientMessages }
  // Same digits and separators as the app and the admin panel: 1,240.5
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
  const ctx: Ctx = { locale, m, num: (n) => fmt.format(n) }
  void numbers(ctx)
  void showcase(ctx)
  void campaigns(ctx)
  void partners(ctx)
}

async function numbers({ num }: Ctx) {
  const n = await getJson<SiteNumbers>('/api/site/numbers')
  if (!n) {
    show('[data-numbers-error]')
    return
  }
  const values: Record<string, number | null> = { reports: n.reports, fixed: n.fixed, avg_fix_days: n.avg_fix_days, confirmed_lyd: n.confirmed_lyd }
  for (const node of document.querySelectorAll<HTMLElement>('[data-num]')) {
    const v = values[node.dataset.num ?? '']
    const missing = v === null || v === undefined
    node.textContent = missing ? '—' : num(v)
    // "— days" reads oddly: the unit only shows next to a number.
    node.parentElement?.querySelector<HTMLElement>('[data-unit]')?.toggleAttribute('hidden', missing)
  }
  const bar = document.querySelector<HTMLElement>('[data-fixed-bar]')
  if (bar && n.reports) bar.style.width = `${Math.round((n.fixed / n.reports) * 100)}%`
}

async function showcase({ locale, m, num }: Ctx) {
  const data = await getJson<ShowcaseResponse>('/api/potholes/showcase')
  const items = (data?.fixed ?? []).filter((r) => r.before_thumb_key && r.after_thumb_key).slice(0, 3)
  const list = document.querySelector('[data-showcase-list]')
  if (!items.length || !list) return
  for (const r of items) {
    const place = [pick(locale, r.street_ar, r.street_en) || m['home.noStreet'], pick(locale, r.region_name_ar, r.region_name_en)].join(locale === 'ar' ? '، ' : ', ')
    const days = r.fixed_at ? Math.round((Date.parse(r.fixed_at) - Date.parse(r.created_at)) / DAY) : null
    const photo = (key: string, label: string, alt: string) =>
      el(
        'figure',
        { class: 'relative m-0 aspect-[4/3] overflow-hidden bg-subtle' },
        el('img', { src: mediaUrl(key), alt: fill(alt, { place }), loading: 'lazy', class: 'size-full object-cover' }),
        el('figcaption', { class: 'absolute start-2 top-2 rounded-full bg-ink/80 px-2.5 py-0.5 text-xs font-semibold text-white' }, label)
      )
    list.append(
      el(
        'article',
        { class: 'flex flex-col overflow-hidden rounded-[20px] border border-default bg-canvas' },
        el('div', { class: 'grid grid-cols-2 gap-[2px]' }, photo(r.before_thumb_key!, m['home.before'], m['home.beforeAlt']), photo(r.after_thumb_key!, m['home.after'], m['home.afterAlt'])),
        el(
          'div',
          { class: 'flex flex-col gap-1 p-4' },
          el('span', { class: 'font-semibold' }, place),
          days === null ? null : el('span', { class: 'text-sm text-secondary' }, days < 1 ? m['home.fixedSameDay'] : fill(m['home.fixedIn'], { n: num(days) }))
        )
      )
    )
  }
  show('[data-showcase]')
}

async function campaigns({ locale, m, num }: Ctx) {
  const data = await getJson<{ results: CampaignSummary[] }>('/api/campaigns')
  const open = (data?.results ?? []).filter((c) => c.status === 'active' || c.status === 'funded').slice(0, 6)
  const list = document.querySelector('[data-campaigns-list]')
  if (!open.length || !list) return
  for (const c of open) {
    const pct = c.target_lyd ? Math.min(100, Math.round((c.confirmed_lyd / c.target_lyd) * 100)) : 0
    list.append(
      el(
        'article',
        { class: 'flex flex-col gap-3 rounded-[20px] border border-default bg-surface p-5' },
        el('span', { class: 'text-lg font-semibold' }, pick(locale, c.street_ar, c.street_en) || m['home.noStreet']),
        el('span', { class: 'text-sm text-secondary' }, pick(locale, c.region_name_ar, c.region_name_en)),
        el('span', { class: 'text-secondary' }, fill(m['home.raised'], { raised: num(c.confirmed_lyd), target: num(c.target_lyd) })),
        el(
          'span',
          { role: 'img', 'aria-label': fill(m['home.raisedAlt'], { pct }), class: 'block h-2.5 overflow-hidden rounded-full bg-subtle' },
          el('span', { class: 'block h-full rounded-full bg-brand', style: `width:${pct}%` })
        ),
        el('span', { class: 'text-sm text-secondary' }, fill(m['home.donors'], { n: num(c.donors_count) }))
      )
    )
  }
  show('[data-campaigns]')
}

/** Said by screen readers only: the link opens another window. */
const newWindow = (m: ClientMessages) => el('span', { class: 'sr-only' }, ` ${m['home.newWindow']}`)

function logo(p: PublicPartner, locale: Locale, m: ClientMessages, size: string) {
  const name = pick(locale, p.name_ar, p.name_en)
  return p.logo_key
    ? el('img', { src: mediaUrl(p.logo_key), alt: fill(m['home.logoAlt'], { name }), loading: 'lazy', class: `${size} shrink-0 rounded-xl border border-default bg-white object-contain p-2` })
    : el('span', { 'aria-hidden': 'true', class: `${size} flex shrink-0 items-center justify-center rounded-xl bg-subtle text-2xl font-bold text-secondary` }, name.replace(/^ال/, '').slice(0, 1))
}

async function partners({ locale, m, num }: Ctx) {
  const data = await getJson<{ results: PublicPartner[] }>('/api/partners?place=home')
  const all = data?.results ?? []
  if (!all.length) return
  const featured = all.find((p) => p.featured)
  const rest = all.filter((p) => p !== featured)
  const kind = (p: PublicPartner) => m[`kind.${p.kind}`]

  if (featured) {
    const name = pick(locale, featured.name_ar, featured.name_en)
    document.querySelector('[data-partners-featured]')?.append(
      el(
        'article',
        { class: 'flex flex-wrap items-center gap-5 rounded-[22px] border border-default bg-canvas p-5' },
        logo(featured, locale, m, 'size-28'),
        el(
          'div',
          { class: 'flex min-w-[220px] flex-1 flex-col gap-1.5' },
          el('span', { class: 'text-sm font-semibold text-link' }, `${m['home.featured']} · ${kind(featured)}`),
          el('h3', { class: 'm-0 text-xl font-bold' }, name),
          pick(locale, featured.description_ar, featured.description_en) ? el('p', { class: 'm-0 text-secondary' }, pick(locale, featured.description_ar, featured.description_en)) : null,
          el(
            'dl',
            { class: 'm-0 flex flex-wrap gap-6' },
            el('div', { class: 'flex flex-col-reverse' }, el('dt', { class: 'text-sm text-secondary' }, m['home.partnerFixed']), el('dd', { class: 'm-0 text-2xl font-bold' }, num(featured.funded_count))),
            el('div', { class: 'flex flex-col-reverse' }, el('dt', { class: 'text-sm text-secondary' }, m['home.partnerLyd']), el('dd', { class: 'm-0 text-2xl font-bold' }, `${num(featured.funded_lyd)} ${m['money.lyd']}`))
          ),
          featured.website
            ? el('a', { href: featured.website, target: '_blank', rel: 'noopener noreferrer', class: 'flex min-h-11 items-center self-start font-semibold' }, m['home.visit'], newWindow(m))
            : null
        )
      )
    )
  }
  const list = document.querySelector('[data-partners-list]')
  for (const p of rest) {
    const name = pick(locale, p.name_ar, p.name_en)
    const body = el(
      'span',
      { class: 'flex min-w-0 flex-col' },
      el('span', { class: 'font-semibold' }, name),
      el('span', { class: 'text-sm text-secondary' }, kind(p)),
      p.funded_count ? el('span', { class: 'text-sm text-secondary' }, fill(m['home.partnerFixedN'], { n: num(p.funded_count) })) : null
    )
    const card = p.website
      ? el('a', { href: p.website, target: '_blank', rel: 'noopener noreferrer', class: 'flex items-center gap-3 rounded-[18px] border border-default bg-canvas p-3 text-primary no-underline hover:border-strong' })
      : el('div', { class: 'flex items-center gap-3 rounded-[18px] border border-default bg-canvas p-3' })
    card.append(logo(p, locale, m, 'size-16'), body)
    if (p.website) body.append(newWindow(m))
    list?.append(card)
  }
  show('[data-partners]')
}
