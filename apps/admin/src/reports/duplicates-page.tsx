import type { DuplicateFlag } from '@hufra/contracts'
import { Link } from '@tanstack/react-router'
import { useId } from 'react'

import { Alert, Button, Card, Spinner, StatusBadge } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime, mediaUrl, pick } from '@/lib/format'

import { useDuplicates } from './use-duplicates'
import { useReviewDuplicate } from './use-reports'

/** A report number kept left-to-right inside Arabic text, so "#12" never shows as "12#". */
const ref = (id: number) => `\u2066#${id}\u2069`

export function DuplicatesPage() {
  const { t, number } = useI18n()
  const pairs = useDuplicates()
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">{t('dup.title')}</h1>
        <p className="m-0 text-sm text-secondary">{t('dup.lead')}</p>
      </div>
      {pairs.isPending ? <Spinner label={t('loading')} /> : null}
      {pairs.isError ? <Alert>{t('error.server')}</Alert> : null}
      {pairs.data?.length === 0 ? <Card className="text-secondary">{t('dup.empty')}</Card> : null}
      {pairs.data && pairs.data.length > 0 ? <p className="m-0 text-sm font-semibold">{t('dup.count', { n: number(pairs.data.length) })}</p> : null}
      {pairs.data?.map((pair) => <Pair key={pair.id} pair={pair} />)}
    </div>
  )
}

function Pair({ pair }: { pair: DuplicateFlag }) {
  const { t, number } = useI18n()
  const review = useReviewDuplicate()
  const titleId = useId()
  return (
    <Card aria-labelledby={titleId} className="flex flex-col gap-4">
      <h2 id={titleId} className="m-0 text-[17px] font-semibold">
        {t('dup.pair', { newer: ref(pair.newer.id), older: ref(pair.older.id) })} <span className="text-sm font-normal text-secondary">· {t('report.dupDistance', { m: number(Math.round(pair.distance_m)) })}</span>
      </h2>
      <div className="grid gap-3 md:grid-cols-2">
        <Side side={pair.newer} label={t('dup.newer')} />
        <Side side={pair.older} label={t('dup.older')} />
      </div>
      <p className="m-0 text-sm">{t('dup.help', { newer: ref(pair.newer.id), older: ref(pair.older.id) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="brand" disabled={review.isPending} onClick={() => review.mutate({ flagId: pair.id, decision: 'confirmed' })}>
          {t('report.dupConfirm')}
        </Button>
        <Button variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ flagId: pair.id, decision: 'rejected' })}>
          {t('report.dupReject')}
        </Button>
      </div>
      <div aria-live="polite">{review.isError ? <Alert>{t('error.server')}</Alert> : null}</div>
    </Card>
  )
}

function Side({ side, label }: { side: DuplicateFlag['newer']; label: string }) {
  const { t, locale, number } = useI18n()
  const street = pick(locale, side.street_ar, side.street_en) ?? t('queue.noStreet')
  return (
    <section aria-label={`${label} #${side.id}`} className="flex gap-3 rounded-md bg-canvas p-3">
      {side.cover_thumb_key ? (
        <img src={mediaUrl(side.cover_thumb_key)} alt={t('dup.photoOf', { id: side.id })} className="size-28 shrink-0 rounded-md object-cover" loading="lazy" />
      ) : (
        <span className="flex size-28 shrink-0 items-center justify-center rounded-md bg-subtle text-center text-xs text-secondary">{t('dup.noPhoto')}</span>
      )}
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-xs font-semibold text-secondary">{label}</span>
        <Link to="/reports/$id" params={{ id: String(side.id) }} className="font-semibold">
          <span dir="ltr">#{side.id}</span> · {street}
        </Link>
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={side.status} label={t(`status.${side.status}`)} />
          <span className="text-[13px] text-secondary">{t(`severity.${side.severity}`)}</span>
        </span>
        <span className="text-[13px] text-secondary">
          {pick(locale, side.region_name_ar, side.region_name_en)} · {dateTime(side.created_at, locale)} · {t('dup.confirmations', { n: number(side.upvotes_count) })}
        </span>
      </span>
    </section>
  )
}
