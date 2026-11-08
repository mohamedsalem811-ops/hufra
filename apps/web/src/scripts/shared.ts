import type { SharedReport } from '@hufra/contracts'

import type { Locale, ShareMessages } from '../i18n/i18n'
import { fill, mediaUrl } from './api'

const ANDROID_PACKAGE = 'ly.tripoli.hufra'
const TONES: Record<string, string> = {
  reported: 'bg-reported-bg text-reported',
  verified: 'bg-verified-bg text-verified',
  under_repair: 'bg-under-repair-bg text-under-repair',
  fixed: 'bg-fixed-bg text-fixed',
}

/** The report id in /r/<id> or /en/r/<id>. */
export function reportId(pathname: string): number | null {
  const m = /^(?:\/en)?\/r\/([1-9]\d{0,9})\/?$/.exec(pathname)
  return m ? Number(m[1]) : null
}

/**
 * Where "Open in the app" goes. Android: an intent for this https link, so an
 * installed app opens it and otherwise the browser comes back to "get the app".
 * Elsewhere: the app's own scheme.
 */
export function openInAppUrl(id: number, userAgent: string, origin: string, pathname: string): string {
  if (/Android/i.test(userAgent)) {
    const fallback = encodeURIComponent(`${origin}${pathname}#get-app`)
    return `intent://${new URL(origin).host}/r/${id}#Intent;scheme=https;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
  }
  return `hufra://pothole/${id}`
}

/** "12 متبرعاً", "3 donors": Arabic number forms. */
function donorsText(locale: Locale, n: number, num: (n: number) => string): string {
  if (locale === 'en') return `${num(n)} donor${n === 1 ? '' : 's'}`
  const forms = { zero: 'متبرع', one: 'متبرع واحد', two: 'متبرعان', few: 'متبرعين', many: 'متبرعاً', other: 'متبرع' }
  const rule = new Intl.PluralRules('ar').select(n) as keyof typeof forms
  return rule === 'one' || rule === 'two' ? forms[rule] : `${num(n)} ${forms[rule]}`
}

export async function startShared() {
  const raw = document.getElementById('i18n')?.textContent
  if (!raw) return
  const { locale, m } = JSON.parse(raw) as { locale: Locale; m: ShareMessages }
  const status = document.querySelector<HTMLElement>('[data-share-status]')
  const gone = (text: string) => {
    status?.setAttribute('hidden', '')
    const box = document.querySelector<HTMLElement>('[data-gone]')
    const p = box?.querySelector('[data-gone-text]')
    if (box && p) (p.textContent = text), (box.hidden = false)
  }

  const id = reportId(location.pathname)
  if (!id) return gone(m['share.notFound'])
  // The page is built once as /r/: point the language switch at this report.
  const lang = document.querySelector<HTMLAnchorElement>('[data-lang-switch]')
  if (lang) lang.href = `${locale === 'ar' ? '/en' : ''}/r/${id}`
  let r: SharedReport
  try {
    const res = await fetch(`/api/potholes/${id}/share`, { headers: { Accept: 'application/json' } })
    if (res.status === 404 || res.status === 400) return gone(m['share.notFound'])
    if (!res.ok) return gone(m['share.failed'])
    r = (await res.json()) as SharedReport
  } catch {
    return gone(m['share.failed'])
  }

  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
  const num = (n: number) => fmt.format(n)
  const date = (iso: string) => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-LY-u-nu-latn' : 'en-GB', { dateStyle: 'long' }).format(new Date(iso))
  const ar = locale === 'ar'
  const street = (ar ? r.street_ar || r.street_en : r.street_en || r.street_ar) || m['share.noStreet']
  const region = ar ? r.region_name_ar : r.region_name_en
  const place = [street, region].join(ar ? '، ' : ', ')
  const q = <T extends HTMLElement>(sel: string) => document.querySelector<T>(sel)

  const title = fill(m['share.place'], { place: street })
  document.title = `${title} · ${m['site.name']}`
  q('[data-title]')!.textContent = title
  const chip = q('[data-chip]')!
  chip.textContent = m[`status.${r.status}` as keyof ShareMessages] ?? r.status
  chip.className += ` ${TONES[r.status] ?? ''}`
  // Isolated so "#1042" keeps its order inside Arabic text.
  q('[data-ref]')!.textContent = `⁦#${r.id}⁩`
  const meta = [
    `${region}${ar ? '، ' : ', '}${m['share.city']}`,
    fill(m['share.severity'], { s: m[`share.sev.${r.severity}` as keyof ShareMessages] ?? r.severity }),
    fill(m['share.reportedOn'], { date: date(r.created_at) }),
  ]
  if (r.fixed_at) meta.push(fill(m['share.fixedOn'], { date: date(r.fixed_at) }))
  q('[data-meta]')!.textContent = meta.join(' · ')
  if (r.upvotes_count > 0) {
    const c = q('[data-confirm]')!
    c.textContent = fill(m['share.confirmations'], { n: num(r.upvotes_count) })
    c.hidden = false
  }

  const after = r.status === 'fixed' && r.photo_after
  const photo = after ? r.photo_after : r.photo_before
  if (photo) {
    const img = q<HTMLImageElement>('[data-photo]')!
    img.src = mediaUrl(photo.r2_key)
    img.alt = fill(after ? m['share.photoAfterAlt'] : m['share.photoAlt'], { place })
    img.hidden = false
  } else q('[data-no-photo]')!.hidden = false

  const c = r.campaign
  if (c) {
    const box = q('[data-campaign]')!
    q('[data-raised]')!.textContent = fill(m['share.raised'], { confirmed: num(c.confirmed_lyd), target: num(c.target_lyd) })
    const pct = (v: number) => `${Math.min(100, c.target_lyd > 0 ? (v / c.target_lyd) * 100 : 0)}%`
    q('[data-bar-confirmed]')!.style.width = pct(c.confirmed_lyd)
    q('[data-bar-pending]')!.style.width = pct(Math.min(c.pending_lyd, Math.max(0, c.target_lyd - c.confirmed_lyd)))
    q('[data-bar]')!.setAttribute('aria-label', fill(m['share.barAlt'], { confirmed: num(c.confirmed_lyd), pending: num(c.pending_lyd), target: num(c.target_lyd) }))
    const line = [c.pending_lyd > 0 ? fill(m['share.pending'], { n: num(c.pending_lyd) }) : '', c.donors > 0 ? donorsText(locale, c.donors, num) : ''].filter(Boolean)
    const pending = q('[data-pending]')!
    pending.textContent = line.join(' · ')
    pending.hidden = !line.length
    q('[data-done]')!.hidden = !(c.status === 'funded' || c.status === 'completed' || c.confirmed_lyd >= c.target_lyd)
    box.hidden = false
  }

  q<HTMLAnchorElement>('[data-open]')!.href = openInAppUrl(r.id, navigator.userAgent, location.origin, location.pathname)
  status?.setAttribute('hidden', '')
  q('[data-report]')!.hidden = false
}
