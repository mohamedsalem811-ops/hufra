import type { adminDonationSchema } from '@hufra/contracts'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'
import type { z } from 'zod'

import { ApiError } from '@/api/client'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { age, dateTime, pick } from '@/lib/format'
import type { MessageKey } from '@/i18n/messages'

import { REVIEW_TABS, useDonations, useReviewDonation, type ReviewTab } from './use-donations'

type Donation = z.infer<typeof adminDonationSchema>
const REASONS = ['not_found', 'amount', 'unclear', 'other'] as const
const AMOUNT = /^\d{1,8}(\.\d{1,3})?$/

export function ReviewPage() {
  const { t, number } = useI18n()
  const search = useSearch({ from: '/donations' })
  const navigate = useNavigate({ from: '/donations' })
  const tab: ReviewTab = search.tab ?? 'under_review'
  const list = useDonations(tab)
  const review = useReviewDonation()
  const [outcome, setOutcome] = useState<string | null>(null)
  const rows = list.data?.results ?? []
  const chosen = rows.find((d) => d.id === search.id) ?? rows[0] ?? null

  const go = (change: { tab?: ReviewTab; id?: number }) => {
    setOutcome(null)
    void navigate({ search: (prev: { tab?: ReviewTab; id?: number }) => ({ ...prev, ...change }), replace: true })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">{t('don.title')}</h1>
          <p className="m-0 text-sm text-secondary">{t('don.lead')}</p>
        </div>
        <div role="tablist" aria-label={t('don.tabs')} className="flex flex-wrap rounded-md bg-subtle p-1">
          {REVIEW_TABS.map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => go({ tab: k === 'under_review' ? undefined : k, id: undefined })}
              className={`min-h-10 rounded-[9px] px-3.5 text-sm ${tab === k ? 'bg-surface font-semibold text-primary' : 'text-secondary'}`}
            >
              {t(`don.tab.${k}`)}
              {list.data && (k === 'under_review' || k === 'awaiting_transfer') ? ` (${number(list.data.counts[k])})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div aria-live="polite">{outcome ? <Alert tone="success">{outcome}</Alert> : null}</div>
      {list.isPending ? <Spinner label={t('loading')} /> : null}
      {list.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>{t('error.server')}</Alert>
          <Button variant="secondary" onClick={() => list.refetch()}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}
      {list.data && rows.length === 0 ? <Card className="text-secondary">{t('don.empty')}</Card> : null}

      {rows.length > 0 ? (
        <div className="grid items-start gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section aria-label={t('don.list')} className="overflow-hidden rounded-lg border border-default bg-surface">
            <ul className="m-0 list-none p-0">
              {rows.map((d) => (
                <li key={d.id} className="border-b border-subtle last:border-0">
                  <button
                    type="button"
                    aria-current={chosen?.id === d.id ? 'true' : undefined}
                    onClick={() => go({ id: d.id })}
                    className={`flex w-full flex-col gap-1 px-4 py-3.5 text-start ${chosen?.id === d.id ? 'border-s-4 border-brand bg-brand-tint' : 'hover:bg-canvas'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-base font-bold">
                        {number(d.amount_lyd)} {t('money.lyd')}
                      </span>
                      {d.warnings[0] ? (
                        <span className="rounded-full bg-warning-bg px-2 py-0.5 text-xs font-semibold text-warning">{t(`don.tag.${d.warnings[0]}` as MessageKey)}</span>
                      ) : (
                        <span className="text-[13px] text-secondary">{age(d.proof_uploaded_at ?? d.created_at, t)}</span>
                      )}
                    </span>
                    <DonationLine d={d} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          {chosen ? (
            <Detail
              key={chosen.id}
              d={chosen}
              tab={tab}
              review={review}
              onDone={(message) => {
                setOutcome(message)
                void navigate({ search: (prev: { tab?: ReviewTab; id?: number }) => ({ ...prev, id: undefined }), replace: true })
              }}
            />
          ) : (
            <Card className="text-secondary">{t('don.pick')}</Card>
          )}
        </div>
      ) : null}
    </div>
  )
}

function DonationLine({ d }: { d: Donation }) {
  const { t, locale } = useI18n()
  return (
    <span className="text-[13px] text-secondary">
      <span dir="ltr">{d.reference_code}</span> · {pick(locale, d.street_ar, d.street_en) ?? t('queue.noStreet')}
    </span>
  )
}

function Detail({ d, tab, review, onDone }: { d: Donation; tab: ReviewTab; review: ReturnType<typeof useReviewDonation>; onDone: (message: string) => void }) {
  const { t, locale, number } = useI18n()
  const headingId = useId()
  return (
    <Card aria-labelledby={headingId} className="flex flex-wrap gap-5">
      <div className="flex min-w-[220px] flex-1 flex-col gap-2">
        <span className="text-sm font-semibold text-secondary">{t('don.screenshot')}</span>
        {d.proof_url ? (
          <>
            <img src={d.proof_url} alt={t('don.screenshotAlt', { ref: d.reference_code })} className="max-h-[440px] w-full rounded-[14px] border border-default object-contain" />
            <a href={d.proof_url} target="_blank" rel="noreferrer" className="flex min-h-9 items-center text-sm font-semibold">
              {t('don.fullSize')}
            </a>
          </>
        ) : (
          <p className="m-0 flex h-40 items-center justify-center rounded-[14px] bg-subtle p-4 text-center text-secondary">{t('don.noScreenshot')}</p>
        )}
      </div>
      <div className="flex min-w-[280px] flex-[2] flex-col gap-3.5">
        <h2 id={headingId} className="m-0 text-[22px] font-bold">
          {number(d.amount_lyd)} {t('money.lyd')} · <span dir="ltr">{d.reference_code}</span>
        </h2>
        <dl className="m-0 grid grid-cols-[120px_minmax(0,1fr)] gap-2.5 text-sm">
          <dt className="text-secondary">{t('don.campaign')}</dt>
          <dd className="m-0">
            <Link to="/campaigns/$id" params={{ id: String(d.campaign_id) }} className="font-semibold">
              {pick(locale, d.street_ar, d.street_en) ?? t('queue.noStreet')} · <span dir="ltr">#{d.pothole_id}</span>
            </Link>
          </dd>
          <dt className="text-secondary">{t('don.donor')}</dt>
          <dd className="m-0">
            {d.donor.name ?? d.donor.code} · <span dir="ltr">{d.donor.email}</span>
          </dd>
          <dt className="text-secondary">{t('don.showName')}</dt>
          <dd className="m-0">{d.show_name ? t('don.showYes') : t('don.showNo')}</dd>
          <dt className="text-secondary">{d.proof_uploaded_at ? t('don.uploaded') : t('don.pledged')}</dt>
          <dd className="m-0">{dateTime(d.proof_uploaded_at ?? d.created_at, locale)}</dd>
        </dl>

        {d.warnings.length ? (
          <div role="note" className="flex flex-col gap-1 rounded-md bg-warning-bg px-3.5 py-3 text-sm leading-6 text-warning">
            {d.warnings.map((w) => (
              <span key={w}>• {t(`don.warn.${w}` as MessageKey)}</span>
            ))}
          </div>
        ) : tab === 'under_review' ? (
          <div role="note" className="rounded-md bg-subtle px-3.5 py-3 text-sm leading-6">
            {t('don.noWarnings', { ref: d.reference_code })}
          </div>
        ) : null}
        {tab === 'under_review' ? <p className="m-0 text-[13px] text-secondary">{t('don.sameShot')}</p> : null}

        {tab === 'under_review' ? <ReviewForm d={d} review={review} onDone={onDone} /> : null}
        {tab === 'confirmed' || tab === 'rejected' ? (
          <p className="m-0 text-sm text-secondary">
            {d.reviewed_at ? t('don.reviewedAt', { date: dateTime(d.reviewed_at, locale) }) : null}
            {d.reject_reason ? ` · ${t('don.rejectWhy', { r: d.reject_reason })}` : ''}
          </p>
        ) : null}
      </div>
    </Card>
  )
}

function ReviewForm({ d, review, onDone }: { d: Donation; review: ReturnType<typeof useReviewDonation>; onDone: (message: string) => void }) {
  const { t, locale } = useI18n()
  const [found, setFound] = useState(false)
  const [amount, setAmount] = useState(String(d.amount_lyd))
  const [rejecting, setRejecting] = useState(false)
  const [reason, setReason] = useState<(typeof REASONS)[number]>('not_found')
  const [other, setOther] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { amount: useId(), match: useId(), reason: useId(), other: useId() }
  const serverError = review.error instanceof ApiError ? (locale === 'ar' && review.error.messageAr) || review.error.message : review.error ? t('error.server') : null

  function confirm(e: FormEvent) {
    e.preventDefault()
    if (!found) return setProblem(t('don.confirmNeedsMatch'))
    const value = AMOUNT.test(amount.trim()) ? Number(amount.trim()) : NaN
    if (!Number.isFinite(value) || value <= 0) return setProblem(t('camp.targetInvalid'))
    setProblem(null)
    review.mutate(
      { id: d.id, review: { decision: 'confirm', ...(value !== d.amount_lyd ? { amount_lyd: value } : {}) } },
      { onSuccess: (res) => onDone(res.campaign_funded ? t('don.funded') : t('don.confirmed')) },
    )
  }

  function reject(e: FormEvent) {
    e.preventDefault()
    const text = reason === 'other' ? other.trim() : t(`don.reason.${reason}`)
    if (text.length < 3) return setProblem(t('don.reasonOther'))
    setProblem(null)
    review.mutate({ id: d.id, review: { decision: 'reject', reason: text } }, { onSuccess: () => onDone(t('don.rejected')) })
  }

  if (rejecting) {
    return (
      <form onSubmit={reject} noValidate className="flex flex-col gap-3">
        <fieldset className="m-0 flex flex-col gap-2 rounded-md border border-default p-3.5">
          <legend className="px-1.5 text-[15px] font-semibold">{t('don.rejectReason')}</legend>
          {REASONS.map((r) => (
            <label key={r} className="flex min-h-10 items-center gap-2 text-[15px]">
              <input type="radio" name="reason" className="size-5" checked={reason === r} onChange={() => setReason(r)} />
              {t(`don.reason.${r}`)}
            </label>
          ))}
          {reason === 'other' ? (
            <>
              <label htmlFor={ids.other} className="text-sm font-semibold">
                {t('don.reasonOther')}
              </label>
              <textarea id={ids.other} rows={2} maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} className="rounded-[10px] border border-strong bg-surface p-3" />
            </>
          ) : null}
        </fieldset>
        {problem ? <Alert>{problem}</Alert> : null}
        {serverError ? <Alert>{serverError}</Alert> : null}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" variant="ghost" className="border-[1.5px] border-danger text-danger!" disabled={review.isPending}>
            {t('don.rejectDo')}
          </Button>
          <Button variant="secondary" onClick={() => setRejecting(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    )
  }

  return (
    <form onSubmit={confirm} noValidate className="flex flex-col gap-3">
      <fieldset className="m-0 flex flex-col gap-2.5 rounded-md border border-default p-3.5">
        <legend className="px-1.5 text-[15px] font-semibold">{t('don.match')}</legend>
        <label htmlFor={ids.match} className="flex min-h-10 items-center gap-2 text-[15px]">
          <input id={ids.match} type="checkbox" className="size-5" checked={found} onChange={(e) => setFound(e.target.checked)} />
          {t('don.found')}
        </label>
        <label htmlFor={ids.amount} className="text-sm font-semibold">
          {t('don.actual')}
        </label>
        <input id={ids.amount} inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} className="min-h-11 max-w-[200px] rounded-[10px] border border-strong bg-surface px-3" />
      </fieldset>
      {problem ? <Alert>{problem}</Alert> : null}
      {serverError ? <Alert>{serverError}</Alert> : null}
      <div className="flex flex-wrap gap-2.5">
        <Button type="submit" className="bg-success! text-white!" disabled={review.isPending}>
          {t('don.confirm')}
        </Button>
        <Button variant="ghost" className="border-[1.5px] border-danger text-danger!" onClick={() => setRejecting(true)}>
          {t('don.reject')}
        </Button>
      </div>
      <p className="m-0 text-[13px] leading-6 text-secondary">{t('don.help')}</p>
    </form>
  )
}
