// The donation pages (plan 9.2; first built on the old site in 6.9): a
// campaign, how much, the bank transfer with its code, the screenshot, then
// under review, the receipt or why it closed, and "My donations".
// Only confirmed money moves the bar; money under review is shown apart.
// Every value from the API is set as text, never as HTML.

import type { BankDetails, CampaignDetailResponse, CampaignSummary, Donation, DonationConfig, SharedReport } from '@hufra/contracts'

import { ui } from '../components/ui'
import type { DonateMessages, Locale } from '../i18n/i18n'
import { href } from '../i18n/i18n'
import { el, fill, mediaUrl } from './api'
import { compressProof, type ProofLimits } from './compress'
import { ApiError, call, currentUser, errorText, signInHref } from './session'

interface PageData {
  locale: Locale
  m: DonateMessages
  signOut?: string
  limits: { min: number; max: number; proof?: ProofLimits }
}

const STATUS_TONES: Record<string, string> = {
  active: 'bg-verified-bg text-verified',
  funded: 'bg-fixed-bg text-fixed',
  completed: 'bg-fixed-bg text-fixed',
  cancelled: 'bg-subtle text-secondary',
  awaiting_transfer: 'bg-under-repair-bg text-under-repair',
  under_review: 'bg-reported-bg text-reported',
  confirmed: 'bg-fixed-bg text-fixed',
  rejected: 'bg-[var(--color-feedback-danger-bg)] text-primary',
  expired: 'bg-subtle text-secondary',
}

function setup() {
  const raw = document.getElementById('i18n')?.textContent
  if (!raw) return null
  const data = JSON.parse(raw) as PageData
  const { locale, m } = data
  const ar = locale === 'ar'
  const fmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 })
  const q = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!
  const statusBox = q('[data-status]')
  const statusText = q('[data-status-text]')
  const retry = q<HTMLButtonElement>('[data-retry]')

  const page = {
    data,
    locale,
    m,
    q,
    /** "12.5 د.ل", "12.5 LYD". */
    lyd: (n: number) => fill(m['don.amount'], { n: fmt.format(n) }),
    num: (n: number) => fmt.format(n),
    date: (iso: string, time = false) =>
      new Intl.DateTimeFormat(ar ? 'ar-LY-u-nu-latn' : 'en-GB', time ? { dateStyle: 'long', timeStyle: 'short' } : { dateStyle: 'long' }).format(new Date(iso)),
    street: (o: { street_ar: string | null; street_en: string | null }) => ((ar ? o.street_ar || o.street_en : o.street_en || o.street_ar) ?? '').trim() || m['don.noStreet'],
    /** Shows one view (and its heading to screen readers), hides the others. */
    show(view: string) {
      statusBox.hidden = true
      for (const v of document.querySelectorAll<HTMLElement>('[data-view]')) v.hidden = v.dataset.view !== view
      const target = q(`[data-view="${view}"]`)
      window.scrollTo(0, 0)
      target.querySelector<HTMLElement>('h1[tabindex]')?.focus({ preventScroll: true })
    },
    /** Loading, or an error with "Try again". */
    status(text: string, again?: () => void) {
      for (const v of document.querySelectorAll<HTMLElement>('[data-view]')) v.hidden = true
      statusBox.hidden = false
      statusText.textContent = text
      statusText.setAttribute('role', again ? 'alert' : 'status')
      retry.hidden = !again
      retry.onclick = again
        ? () => {
            page.status(m['don.loading'])
            again()
          }
        : null
    },
    failed(err: unknown, again: () => void) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return page.status(m['don.notFound'])
      page.status(errorText(locale, err, m['don.failed']), again)
    },
    chip(node: HTMLElement, status: string, label: string) {
      node.textContent = label
      node.className = `self-start rounded-full px-3 py-1 text-[13px] font-semibold ${STATUS_TONES[status] ?? ''}`
    },
    /** Quick amount buttons fill the field and show which one is chosen. */
    quickAmounts(root: ParentNode, input: HTMLInputElement) {
      const chips = [...root.querySelectorAll<HTMLButtonElement>('[data-quick] button')]
      const sync = () => chips.forEach((c) => c.setAttribute('aria-pressed', String(Number(c.dataset.value) === Number(input.value))))
      chips.forEach((c) =>
        c.addEventListener('click', () => {
          input.value = c.dataset.value!
          sync()
        }),
      )
      input.addEventListener('input', sync)
      sync()
    },
    /** A whole number of millimes between the limits. */
    validAmount(value: number) {
      return value >= data.limits.min && value <= data.limits.max && Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6
    },
  }
  return page
}
type Page = NonNullable<ReturnType<typeof setup>>

/** The number in /donate/<id> or /donations/<id> (with or without /en). */
export function pageId(pathname: string, base: 'donate' | 'donations'): number | null {
  const m = new RegExp(`^(?:/en)?/${base}/([1-9]\\d{0,9})/?$`).exec(pathname)
  return m ? Number(m[1]) : null
}

/** The page is built once for every id: point the language switch at this one. */
function fixLanguageSwitch(locale: Locale) {
  const lang = document.querySelector<HTMLAnchorElement>('[data-lang-switch]')
  if (lang) lang.href = locale === 'ar' ? `/en${location.pathname}` : location.pathname.replace(/^\/en(?=\/)/, '')
}

// ------------------------------------------------------------------ campaign

export async function startCampaign() {
  const page = setup()
  if (!page) return
  const { locale, m, q } = page
  const id = pageId(location.pathname, 'donate')
  fixLanguageSwitch(locale)
  if (!id) return page.status(m['don.notFound'])
  for (const b of document.querySelectorAll<HTMLButtonElement>('[data-back]')) b.addEventListener('click', () => page.show('campaign'))

  let campaign: CampaignSummary | null = null
  let config: DonationConfig | null = null
  const load = async () => {
    try {
      const [detail, cfg] = await Promise.all([call<CampaignDetailResponse>(`/api/campaigns/${id}`), call<DonationConfig>('/api/donations/config')])
      campaign = detail.campaign
      config = cfg
      renderCampaign(page, detail, cfg)
      page.show('campaign')
    } catch (err) {
      page.failed(err, load)
    }
  }

  q<HTMLButtonElement>('[data-donate]').addEventListener('click', async () => {
    try {
      const user = await currentUser()
      if (!user) {
        q<HTMLAnchorElement>('[data-signin]').href = signInHref(locale)
        q<HTMLAnchorElement>('[data-signup]').href = signInHref(locale, location.pathname, '/sign-up')
        return page.show('signin')
      }
      page.show('amount')
      q<HTMLInputElement>('#amount').focus()
    } catch (err) {
      page.failed(err, () => void load())
    }
  })

  const form = q<HTMLFormElement>('[data-amount-form]')
  const input = q<HTMLInputElement>('#amount')
  const error = q('[data-error]', form)
  const submit = q<HTMLButtonElement>('button[type=submit]', form)
  page.quickAmounts(form, input)
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault()
    error.hidden = true
    const value = Number(input.value)
    if (!input.value || !page.validAmount(value)) {
      error.textContent = fill(m['don.invalid'], { min: page.num(page.data.limits.min), max: page.num(page.data.limits.max) })
      error.hidden = false
      input.setAttribute('aria-invalid', 'true')
      return input.focus()
    }
    input.removeAttribute('aria-invalid')
    if (!campaign || !config) return
    submit.disabled = true
    submit.textContent = m['don.sending']
    try {
      const showName = (form.elements.namedItem('show_name') as HTMLInputElement).checked
      const res = await call<{ donation: Donation }>(`/api/campaigns/${campaign.id}/donations`, {
        method: 'POST',
        body: { amount_lyd: value, show_name: showName, method: 'bank_transfer' },
      })
      location.assign(href(locale, `/donations/${res.donation.id}`))
    } catch (err) {
      submit.disabled = false
      submit.textContent = m['don.continue']
      if (err instanceof ApiError && err.status === 401) return location.assign(signInHref(locale))
      error.textContent = errorText(locale, err, m['don.failed'])
      error.hidden = false
    }
  })

  await load()
}

function renderCampaign(page: Page, detail: CampaignDetailResponse, config: DonationConfig) {
  const { locale, m, q, lyd, num } = page
  const c = detail.campaign
  const ar = locale === 'ar'
  const street = page.street(c)
  const region = ar ? c.region_name_ar : c.region_name_en
  document.title = `${street} · ${m['don.title']}`
  q('[data-title]').textContent = street
  q('[data-region]').textContent = region
  page.chip(q('[data-chip]'), c.status, m[`don.c.${c.status}`])

  // The photo comes from the report's public card; a campaign is fine without it.
  void fetch(`/api/potholes/${c.pothole_id}/share`, { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? (r.json() as Promise<SharedReport>) : null))
    .then((r) => {
      const photo = r && (r.status === 'fixed' && r.photo_after ? r.photo_after : r.photo_before)
      if (!photo) return
      const img = q<HTMLImageElement>('[data-photo]')
      img.src = mediaUrl(photo.r2_key)
      img.alt = fill(m['don.photoAlt'], { place: `${street}${ar ? '، ' : ', '}${region}` })
      q('[data-hero]').hidden = false
    })
    .catch(() => undefined)

  const target = c.target_lyd
  const pct = (v: number) => `${Math.min(100, target > 0 ? (v / target) * 100 : 0)}%`
  const review = Math.min(c.under_review_lyd, Math.max(0, target - c.confirmed_lyd))
  q('[data-raised]').textContent = fill(m['don.raised'], { confirmed: num(c.confirmed_lyd), target: num(target) })
  q('[data-bar-confirmed]').style.width = pct(c.confirmed_lyd)
  q('[data-bar-review]').style.width = pct(review)
  q('[data-bar]').setAttribute('aria-label', fill(m['don.barAlt'], { confirmed: num(c.confirmed_lyd), pending: num(c.under_review_lyd), target: num(target) }))
  const reviewLine = q('[data-review]')
  reviewLine.textContent = fill(m['don.review'], { n: num(c.under_review_lyd) })
  reviewLine.hidden = c.under_review_lyd <= 0
  const left = Math.max(0, target - c.confirmed_lyd)
  q('[data-donors]').textContent = [donorsText(locale, c.donors_count, num), c.status === 'active' && left > 0 ? fill(m['don.left'], { n: num(left) }) : '']
    .filter(Boolean)
    .join(' · ')
  q('[data-note]').textContent = (ar ? c.note_ar || c.note_en : c.note_en || c.note_ar) || m['don.use']

  const costs = q('[data-cost-list]')
  costs.replaceChildren(
    ...c.cost_items.map((item) =>
      el('div', { class: 'flex justify-between gap-3 border-b border-subtle py-2.5 last:border-b-0' }, el('dt', {}, item.label), el('dd', { class: 'm-0 font-semibold' }, lyd(item.amount_lyd))),
    ),
  )
  q('[data-costs]').hidden = !c.cost_items.length

  const closed = c.status === 'funded' ? m['don.closedFunded'] : c.status === 'completed' ? m['don.closedDone'] : c.status === 'cancelled' ? m['don.closedCancelled'] : ''
  const closedBox = q('[data-closed]')
  closedBox.textContent = closed
  closedBox.hidden = !closed
  q('[data-not-open]').hidden = !!closed || config.enabled
  q('[data-donate]').hidden = !!closed || !config.enabled

  const wall = q('[data-wall]')
  wall.replaceChildren(
    ...detail.donors.map((d) =>
      el('li', { class: 'flex justify-between gap-3 border-b border-subtle py-2.5 last:border-b-0' }, el('span', {}, d.name || m['don.anon']), el('span', { class: 'text-secondary' }, lyd(d.amount_lyd))),
    ),
  )
  q('[data-no-donors]').hidden = detail.donors.length > 0
  q<HTMLAnchorElement>('[data-report]').href = href(locale, `/r/${c.pothole_id}`)
}

/** "12 متبرعاً", "3 donors": Arabic number forms. */
function donorsText(locale: Locale, n: number, num: (n: number) => string): string {
  if (n === 0) return ''
  if (locale === 'en') return `${num(n)} donor${n === 1 ? '' : 's'}`
  const forms = { zero: 'متبرع', one: 'متبرع واحد', two: 'متبرعان', few: 'متبرعين', many: 'متبرعاً', other: 'متبرع' }
  const rule = new Intl.PluralRules('ar').select(n) as keyof typeof forms
  return rule === 'one' || rule === 'two' ? forms[rule] : `${num(n)} ${forms[rule]}`
}

// ------------------------------------------------------------------ my donations and one donation

export async function startDonations() {
  const page = setup()
  if (!page) return
  const id = pageId(location.pathname, 'donations')
  fixLanguageSwitch(page.locale)
  if (id) await oneDonation(page, id)
  else await myDonations(page)
}

async function myDonations(page: Page) {
  const { locale, m, q, lyd } = page
  try {
    const user = await currentUser()
    if (!user) {
      q<HTMLAnchorElement>('[data-signin]').href = signInHref(locale)
      return page.show('signin')
    }
    const { results } = await call<{ results: Donation[] }>('/api/donations/mine')
    q('[data-who]').textContent = fill(m['don.signedInAs'], { email: user.email })
    q('[data-total]').textContent = lyd(results.filter((d) => d.status === 'confirmed').reduce((s, d) => s + d.amount_lyd, 0))
    q('[data-list]').replaceChildren(...results.map((d) => donationItem(page, d)))
    q('[data-empty]').hidden = results.length > 0
    q<HTMLButtonElement>('[data-sign-out]').onclick = async () => {
      await call('/api/auth/logout', { method: 'POST' }).catch(() => undefined)
      location.assign(href(locale, '/'))
    }
    page.show('mine')
  } catch (err) {
    page.failed(err, () => void myDonations(page))
  }
}

function donationItem(page: Page, d: Donation) {
  const { locale, m, lyd } = page
  const sub =
    d.status === 'awaiting_transfer' && d.expires_at
      ? `${fill(m['don.ends'], { h: Math.max(0, Math.ceil((Date.parse(d.expires_at) - Date.now()) / 3_600_000)) })} · ⁦${d.reference_code}⁩`
      : page.date(d.reviewed_at || d.created_at)
  const chip = el('span', {})
  page.chip(chip, d.status, m[`don.s.${d.status}`])
  return el(
    'li',
    {},
    el(
      'a',
      { href: href(locale, `/donations/${d.id}`), class: `${ui.card} gap-1.5 text-primary no-underline hover:border-strong` },
      el('span', { class: 'flex flex-wrap items-center justify-between gap-2' }, el('strong', { class: 'font-semibold' }, `${page.street(d)} · ${lyd(d.amount_lyd)}`), chip),
      el('span', { class: 'text-sm text-secondary' }, sub),
      d.status === 'awaiting_transfer' ? el('span', { class: 'font-semibold text-link' }, m['don.finish']) : null,
      d.status === 'rejected' && d.reject_reason ? el('span', { class: 'text-sm' }, fill(m['don.reason'], { r: d.reject_reason })) : null,
    ),
  )
}

async function oneDonation(page: Page, id: number) {
  const { locale } = page
  try {
    const { donation, bank } = await call<{ donation: Donation; bank: BankDetails | null }>(`/api/donations/${id}`)
    renderDonation(page, donation, bank)
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return location.assign(signInHref(locale))
    page.failed(err, () => void oneDonation(page, id))
  }
}

function renderDonation(page: Page, d: Donation, bank: BankDetails | null) {
  if (d.status === 'awaiting_transfer' && bank) return transferStep(page, d, bank)
  return result(page, d)
}

function transferStep(page: Page, d: Donation, bank: BankDetails) {
  const { m, q, lyd } = page
  const values: Record<string, [shown: string, copied: string] | null> = {
    account_holder: [bank.account_holder, bank.account_holder],
    bank_name: [bank.bank_name, bank.bank_name],
    account_number: bank.account_number ? [bank.account_number, bank.account_number] : null,
    iban: bank.iban ? [bank.iban.replace(/(.{4})/g, '$1 ').trim(), bank.iban] : null,
    amount: [lyd(d.amount_lyd), String(d.amount_lyd)],
    code: [d.reference_code, d.reference_code],
  }
  const announce = q('[data-copied]')
  for (const row of document.querySelectorAll<HTMLElement>('[data-bank]')) {
    const v = values[row.dataset.bank!]
    row.hidden = !v
    if (!v) continue
    q('[data-value]', row).textContent = v[0]
    const btn = row.querySelector<HTMLButtonElement>('[data-copy]')
    if (btn) btn.onclick = () => copy(v[1], btn, m, announce)
  }
  const until = q('[data-until]')
  until.hidden = !d.expires_at
  if (d.expires_at) until.textContent = fill(m['don.until'], { date: page.date(d.expires_at, true) })
  q<HTMLButtonElement>('[data-to-proof]').onclick = () => proofStep(page, d, bank)

  const ask = q('[data-cancel-ask]')
  const cancelError = q('[data-cancel-error]')
  ask.hidden = true
  q<HTMLButtonElement>('[data-cancel]').onclick = () => {
    ask.hidden = false
    q('[data-cancel-text]').focus()
  }
  q<HTMLButtonElement>('[data-cancel-no]').onclick = () => {
    ask.hidden = true
    q<HTMLButtonElement>('[data-cancel]').focus()
  }
  q<HTMLButtonElement>('[data-cancel-yes]').onclick = async () => {
    cancelError.hidden = true
    try {
      await call(`/api/donations/${d.id}/cancel`, { method: 'POST', body: {} })
      await oneDonation(page, d.id)
    } catch (err) {
      cancelError.textContent = errorText(page.locale, err, m['don.failed'])
      cancelError.hidden = false
    }
  }
  page.show('transfer')
}

async function copy(value: string, btn: HTMLButtonElement, m: DonateMessages, announce: HTMLElement) {
  try {
    await navigator.clipboard.writeText(value)
  } catch {
    // No clipboard permission (older browsers, some in-app browsers): copy from a hidden field.
    const field = el('textarea', { class: 'sr-only', readonly: '' })
    field.value = value
    document.body.append(field)
    field.select()
    document.execCommand('copy')
    field.remove()
  }
  btn.textContent = m['don.copied']
  announce.textContent = m['don.copied']
  setTimeout(() => {
    btn.textContent = m['don.copy']
    announce.textContent = ''
  }, 1600)
}

function proofStep(page: Page, d: Donation, bank: BankDetails | null) {
  const { locale, m, q } = page
  const form = q<HTMLFormElement>('[data-proof-form]')
  const input = q<HTMLInputElement>('#sent', form)
  const file = q<HTMLInputElement>('#shot', form)
  const preview = q<HTMLImageElement>('[data-preview]', form)
  const shotStatus = q('[data-shot-status]', form)
  const pick = q('[data-pick]', form)
  const error = q('[data-error]', form)
  const submit = q<HTMLButtonElement>('button[type=submit]', form)
  input.value = String(d.amount_lyd)
  page.quickAmounts(form, input)
  let blob: Blob | null = null
  preview.hidden = true
  shotStatus.textContent = ''
  error.hidden = true

  const fail = (text: string) => {
    error.textContent = text
    error.hidden = false
  }
  file.onchange = async () => {
    const f = file.files?.[0]
    if (!f) return
    error.hidden = true
    try {
      blob = await compressProof(f, page.data.limits.proof!)
      if (preview.src) URL.revokeObjectURL(preview.src)
      preview.src = URL.createObjectURL(blob)
      preview.hidden = false
      pick.textContent = m['don.replace']
      shotStatus.textContent = fill(m['don.added'], { kb: Math.round(blob.size / 1024) })
    } catch {
      blob = null
      fail(m['don.badImage'])
    }
  }
  form.onsubmit = async (ev) => {
    ev.preventDefault()
    error.hidden = true
    const value = Number(input.value)
    if (!page.validAmount(value)) return fail(fill(m['don.invalid'], { min: page.num(page.data.limits.min), max: page.num(page.data.limits.max) }))
    if (!blob) return fail(m['don.needShot'])
    const body = new FormData()
    body.append('proof', blob, 'transfer.jpg')
    body.append('amount_lyd', String(value))
    submit.disabled = true
    submit.textContent = m['don.sending']
    try {
      const res = await call<{ donation: Donation }>(`/api/donations/${d.id}/proof`, { method: 'POST', form: body })
      result(page, res.donation)
    } catch (err) {
      fail(errorText(locale, err, m['don.failed']))
    } finally {
      submit.disabled = false
      submit.textContent = m['don.submit']
    }
  }
  q<HTMLButtonElement>('[data-back]').onclick = () => (bank && d.status === 'awaiting_transfer' ? transferStep(page, d, bank) : result(page, d))
  page.show('proof')
}

function result(page: Page, d: Donation) {
  const { locale, m, q, lyd } = page
  const box = q('[data-result-box]')
  const title = q('[data-result-title]')
  const body = q('[data-result-body]')
  const reason = q('[data-reason]')
  const tone: Record<string, string> = {
    under_review: 'bg-[var(--color-feedback-success-bg)]',
    confirmed: 'bg-[var(--color-feedback-success-bg)]',
    rejected: 'bg-[var(--color-feedback-danger-bg)]',
  }
  box.className = `flex flex-col gap-2 rounded-[18px] p-5 ${tone[d.status] ?? 'bg-subtle'}`
  const texts: Record<string, [string, string]> = {
    under_review: [m['don.thanks'], m['don.thanksBody']],
    confirmed: [m['don.receipt'], m['don.receiptBody']],
    rejected: [m['don.s.rejected'], m['don.rejected']],
    expired: [m['don.s.expired'], m['don.expired']],
    cancelled: [m['don.s.cancelled'], m['don.cancelled']],
    awaiting_transfer: [m['don.s.awaiting_transfer'], ''],
  }
  const [heading, text] = texts[d.status] ?? [m[`don.s.${d.status}`], '']
  title.textContent = heading
  body.textContent = text
  body.hidden = !text
  reason.hidden = !(d.status === 'rejected' && d.reject_reason)
  if (d.reject_reason) reason.textContent = fill(m['don.reason'], { r: d.reject_reason })

  const fields: Record<string, string | null> = {
    amount: lyd(d.amount_lyd),
    campaign: page.street(d),
    code: d.reference_code,
    status: d.status === 'confirmed' ? null : m[`don.s.${d.status}`],
    date: page.date(d.reviewed_at || d.created_at),
  }
  for (const row of document.querySelectorAll<HTMLElement>('[data-field]')) {
    const v = fields[row.dataset.field!]
    row.hidden = !v
    if (v) q('[data-value]', row).textContent = v
  }

  const closed = d.status === 'rejected' || d.status === 'expired' || d.status === 'cancelled'
  const replace = q<HTMLButtonElement>('[data-replace]')
  replace.hidden = d.status !== 'under_review'
  replace.onclick = () => proofStep(page, d, null)
  const print = q<HTMLButtonElement>('[data-print]')
  print.hidden = d.status !== 'confirmed'
  print.onclick = () => window.print()
  const again = q<HTMLAnchorElement>('[data-again]')
  again.hidden = !closed
  again.href = href(locale, `/donate/${d.campaign_id}`)
  q('[data-contact]').hidden = d.status !== 'rejected'
  q<HTMLAnchorElement>('[data-to-report]').href = href(locale, `/r/${d.pothole_id}`)
  page.show('result')
}
