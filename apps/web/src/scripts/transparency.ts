import type { CampaignSummary, SiteNumbers } from '@hufra/contracts'

import type { Locale, TransparencyMessages } from '../i18n/i18n'
import { el, fill, getJson, mediaUrl } from './api'

type M = TransparencyMessages
const pick = (locale: Locale, ar: string | null | undefined, en: string | null | undefined) => (locale === 'ar' ? ar || en : en || ar) || ''
const td = (...children: (Node | string | null)[]) => el('td', { class: 'border-b border-subtle px-2 py-2.5' }, ...children)

export function startTransparency() {
  const data = document.getElementById('i18n')?.textContent
  if (!data) return
  const { locale, m } = JSON.parse(data) as { locale: Locale; m: M }
  // Same digits and separators as the app and the admin panel.
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
  const num = (n: number) => fmt.format(n)
  void numbers(locale, m, num)
  void completed(locale, m, num)
}

async function numbers(locale: Locale, m: M, num: (n: number) => string) {
  const n = await getJson<SiteNumbers>('/api/site/numbers')
  if (!n) {
    document.querySelector('[data-error]')?.removeAttribute('hidden')
    return
  }
  const values: Record<string, number | null> = {
    reports: n.reports, fixed: n.fixed, open: n.open, avg_fix_days: n.avg_fix_days,
    confirmed_lyd: n.confirmed_lyd, spent_lyd: n.spent_lyd, in_open_campaigns_lyd: n.in_open_campaigns_lyd, moved_lyd: n.moved_lyd,
  }
  for (const node of document.querySelectorAll<HTMLElement>('[data-num]')) {
    const v = values[node.dataset.num ?? '']
    const missing = v === null || v === undefined
    node.textContent = missing ? '—' : num(v)
    node.parentElement?.querySelector<HTMLElement>('[data-unit]')?.toggleAttribute('hidden', missing)
  }
  const pct = document.querySelector('[data-fixed-pct]')
  if (pct && n.reports) pct.textContent = fill(m['tr.fixedPct'], { pct: Math.round((n.fixed / n.reports) * 100) })
  const time = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', { dateStyle: 'long', timeStyle: 'short' }).format(new Date(n.updated_at))
  const updated = document.querySelector('[data-updated]')
  if (updated) updated.textContent = fill(m['tr.updated'], { time })

  chart(n.monthly_fixed, locale, m, num)

  const body = document.querySelector('[data-regions]')
  if (!n.by_region.length) body?.append(el('tr', {}, el('td', { colspan: '4', class: 'px-2 py-3 text-secondary' }, m['tr.noReports'])))
  for (const r of n.by_region) {
    body?.append(
      el(
        'tr',
        {},
        el('th', { scope: 'row', class: 'border-b border-subtle px-2 py-2.5 text-start font-normal' }, pick(locale, r.name_ar, r.name_en)),
        td(num(r.reports)),
        td(num(r.fixed)),
        td(r.avg_fix_days === null ? '—' : num(r.avg_fix_days))
      )
    )
  }
}

/** Six months of repairs: one series, one colour, the current month darker; a description and a table view. */
function chart(months: SiteNumbers['monthly_fixed'], locale: Locale, m: M, num: (n: number) => string) {
  const box = document.querySelector<HTMLElement>('[data-chart]')
  const toggle = document.querySelector<HTMLButtonElement>('[data-toggle]')
  if (!box || !toggle) return
  const max = Math.max(1, ...months.map((x) => x.count))
  const label = (month: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-15T00:00:00Z`))

  const bars = el('div', { class: 'flex h-[220px] items-end gap-3 border-b border-default px-1.5' })
  months.forEach((x, i) => {
    const last = i === months.length - 1
    const bar = el('span', {
      class: `block w-full rounded-t-[4px] ${last ? 'bg-[var(--color-status-fixed-fg)]' : 'bg-[var(--color-status-fixed-pin)]'}`,
      style: `height:${x.count ? Math.max(3, (x.count / max) * 100) : 1}%`,
      title: `${label(x.month)}: ${num(x.count)}`,
    })
    bars.append(el('span', { class: 'flex h-full flex-1 items-end' }, bar))
  })
  const figure = el(
    'div',
    {},
    el('div', { role: 'img', 'aria-label': fill(m['tr.monthlyAlt'], { n: num(months.at(-1)?.count ?? 0), max: num(max) }) }, bars),
    el('div', { class: 'mt-2 flex justify-between text-[13px] text-secondary' }, el('span', {}, label(months[0]?.month ?? '')), el('span', {}, label(months.at(-1)?.month ?? '')))
  )
  const table = el(
    'table',
    { class: 'w-full border-collapse text-[15px]', 'aria-labelledby': 'mf', hidden: '' },
    el('thead', {}, el('tr', { class: 'text-secondary' }, el('th', { scope: 'col', class: 'py-1.5 text-start font-semibold' }, m['tr.month']), el('th', { scope: 'col', class: 'py-1.5 text-start font-semibold' }, m['tr.fixedCol']))),
    el('tbody', {}, ...months.map((x) => el('tr', { class: 'border-t border-subtle' }, el('td', { class: 'py-1.5' }, label(x.month)), el('td', { class: 'py-1.5 font-semibold' }, num(x.count)))))
  )
  box.append(figure, table)
  toggle.hidden = false
  toggle.addEventListener('click', () => {
    const asTable = table.hidden
    table.hidden = !asTable
    figure.hidden = asTable
    toggle.setAttribute('aria-pressed', String(asTable))
    toggle.textContent = asTable ? m['tr.asChart'] : m['tr.asTable']
  })
}

async function completed(locale: Locale, m: M, num: (n: number) => string) {
  const body = document.querySelector('[data-completed]')
  if (!body) return
  const data = await getJson<{ results: CampaignSummary[] }>('/api/campaigns?status=completed')
  const done = data?.results ?? []
  if (!done.length) {
    body.append(el('tr', {}, el('td', { colspan: '5', class: 'px-2 py-3 text-secondary' }, m['tr.noCompleted'])))
    return
  }
  const lyd = (n: number) => `${num(n)} ${m['money.lyd']}`
  for (const c of done) {
    const place = [pick(locale, c.street_ar, c.street_en) || m['home.noStreet'], pick(locale, c.region_name_ar, c.region_name_en)].join(locale === 'ar' ? '، ' : ', ')
    const diff = c.final_cost_lyd === null ? null : Math.round((c.confirmed_lyd - c.final_cost_lyd) * 1000) / 1000
    body.append(
      el(
        'tr',
        {},
        el('th', { scope: 'row', class: 'border-b border-subtle px-2 py-2.5 text-start font-normal' }, place),
        td(lyd(c.target_lyd)),
        td(c.final_cost_lyd === null ? '—' : lyd(c.final_cost_lyd)),
        td(diff === null || diff === 0 ? '—' : diff > 0 ? fill(m['tr.diffMoved'], { n: num(diff) }) : fill(m['tr.diffOver'], { n: num(-diff) })),
        td(
          c.receipt_key
            ? el('a', { href: mediaUrl(c.receipt_key), target: '_blank', rel: 'noopener', class: 'inline-flex min-h-11 items-center font-semibold' }, m['tr.receiptView'], el('span', { class: 'sr-only' }, ` ${fill(m['tr.receiptAlt'], { place })} ${m['home.newWindow']}`))
            : '—'
        )
      )
    )
  }
}
