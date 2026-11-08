import { PHOTO_LIMITS, STATUS_ORDER, TEXT_LIMITS, type AdminReport, type PotholeStatus } from '@hufra/contracts'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import { ApiError } from '@/api/client'
import { Alert, Button, Card, Spinner, StatusBadge } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime, mediaUrl, pick } from '@/lib/format'

import { useChangeStatus, useDeleteReport, useReport, useReviewDuplicate, useUploadProof } from './use-reports'

const REASON_MIN = TEXT_LIMITS.reopenNoteMin
type Stage = 'report' | 'before' | 'during' | 'after'
const STAGES: Stage[] = ['report', 'before', 'during', 'after']

export function ReportPage() {
  const { id } = useParams({ from: '/reports/$id' })
  const reportId = Number(id)
  const { t } = useI18n()
  const report = useReport(reportId)

  if (report.isPending) return <Spinner label={t('loading')} />
  if (report.isError) {
    const missing = report.error instanceof ApiError && (report.error.status === 404 || report.error.status === 400)
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert>{missing ? t('report.notFound') : t('error.server')}</Alert>
        {missing ? (
          <Link to="/reports" className="font-semibold">
            {t('queue.title')}
          </Link>
        ) : (
          <Button variant="secondary" onClick={() => report.refetch()}>
            {t('error.retry')}
          </Button>
        )}
      </div>
    )
  }
  return <ReportView data={report.data} />
}

function ReportView({ data }: { data: AdminReport }) {
  const { t, locale, number } = useI18n()
  const p = data.pothole
  const street = pick(locale, p.street_ar, p.street_en) ?? t('queue.noStreet')
  const [copied, setCopied] = useState(false)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <nav aria-label={t('report.crumbs')} className="text-sm text-secondary">
          <Link to="/reports">{t('queue.title')}</Link> / <span dir="ltr">#{p.id}</span>
        </nav>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="m-0 text-[28px] font-bold">{street}</h1>
            <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
            <span className="inline-flex h-7 items-center rounded-full bg-subtle px-3 text-[13px] font-semibold text-secondary">{t(`severity.${p.severity}`)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              className="inline-flex min-h-11 items-center rounded-[10px] border-[1.5px] border-brand px-4 font-semibold text-brand no-underline"
              href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=18/${p.lat}/${p.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('report.openMaps')}
            </a>
            <Button
              variant="secondary"
              onClick={() => {
                void navigator.clipboard?.writeText(`${location.origin}/pothole/${p.id}`).then(() => setCopied(true))
              }}
            >
              {t('report.copyLink')}
            </Button>
          </div>
        </div>
        <p className="m-0 text-sm text-secondary">
          {pick(locale, p.region_name_ar, p.region_name_en)} · {t('report.reportedOn', { date: dateTime(p.created_at, locale, false) })} ·{' '}
          {t('report.upvotes', { n: number(p.upvotes_count) })}
        </p>
        <div aria-live="polite">{copied ? <Alert tone="success">{t('report.copied')}</Alert> : null}</div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Photos data={data} />
          <Details data={data} />
          <History data={data} />
        </div>
        <aside className="flex flex-col gap-4">
          <StatusForm data={data} />
          <CampaignCard data={data} />
          <Duplicates data={data} />
          <DeleteReport id={p.id} />
        </aside>
      </div>
    </div>
  )
}

function Photos({ data }: { data: AdminReport }) {
  const { t, locale } = useI18n()
  const [stage, setStage] = useState<Stage>('report')
  const tabs = useRef<(HTMLButtonElement | null)[]>([])
  const base = useId()
  const upload = useUploadProof(data.pothole.id)
  const shown = data.photos.filter((ph) => ph.stage === stage)

  function onKey(e: KeyboardEvent, i: number) {
    const dir = document.documentElement.dir === 'rtl' ? -1 : 1
    const step = e.key === 'ArrowRight' ? dir : e.key === 'ArrowLeft' ? -dir : 0
    if (!step) return
    const next = (i + step + STAGES.length) % STAGES.length
    setStage(STAGES[next]!)
    tabs.current[next]?.focus()
  }

  let uploadMessage: string | null = null
  if (upload.isPending) uploadMessage = t('report.uploading')
  else if (upload.isSuccess) uploadMessage = t('report.uploaded')
  else if (upload.error) uploadMessage = upload.error instanceof ApiError ? (locale === 'ar' && upload.error.messageAr) || upload.error.message : t('report.badImage')

  return (
    <Card aria-label={t('report.photos')} className="flex flex-col gap-3">
      <div role="tablist" aria-label={t('report.photoStages')} className="flex flex-wrap gap-1.5">
        {STAGES.map((s, i) => (
          <button
            key={s}
            ref={(el) => {
              tabs.current[i] = el
            }}
            id={`${base}-tab-${s}`}
            type="button"
            role="tab"
            aria-selected={stage === s}
            aria-controls={`${base}-panel`}
            tabIndex={stage === s ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => setStage(s)}
            className={`min-h-10 rounded-full px-4 text-sm font-semibold ${stage === s ? 'bg-brand-solid text-white' : 'bg-subtle text-secondary'}`}
          >
            {t(`report.stage.${s}`)} ({data.photos.filter((ph) => ph.stage === s).length})
          </button>
        ))}
      </div>
      <div id={`${base}-panel`} role="tabpanel" aria-labelledby={`${base}-tab-${stage}`} className="flex flex-col gap-3">
        {shown.length === 0 ? <p className="m-0 text-secondary">{t('report.noPhotos')}</p> : null}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-2">
          {shown.map((ph, i) => (
            <a key={ph.id} href={mediaUrl(ph.r2_key)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md">
              <img src={mediaUrl(ph.thumb_key)} alt={t('report.photoAlt', { n: i + 1, stage: t(`report.stage.${stage}`) })} className="aspect-[4/3] w-full object-cover" loading="lazy" />
            </a>
          ))}
        </div>
        {stage !== 'report' ? (
          shown.length >= PHOTO_LIMITS.maxPerStage ? (
            <p className="m-0 text-sm text-secondary">{t('report.stageFull')}</p>
          ) : (
            <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-[10px] border-[1.5px] border-brand px-4 font-semibold text-brand focus-within:outline-3 focus-within:outline-focus">
              {t('report.addProof', { stage: t(`report.stage.${stage}`) })}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                disabled={upload.isPending}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) upload.mutate({ file, stage })
                }}
              />
            </label>
          )
        ) : null}
        <div aria-live="polite">{uploadMessage ? <Alert tone={upload.isError ? 'danger' : 'success'}>{uploadMessage}</Alert> : null}</div>
      </div>
    </Card>
  )
}

function Details({ data }: { data: AdminReport }) {
  const { t, locale, number } = useI18n()
  const p = data.pothole
  const dash = (n: number | null) => (n === null ? '—' : number(n))
  const rows: [string, React.ReactNode][] = [
    [t('report.description'), pick(locale, p.description_ar, p.description_en) ?? <span className="text-secondary">{t('report.noDescription')}</span>],
    [t('report.size'), t('report.sizeValue', { l: dash(p.length_cm), w: dash(p.width_cm), d: dash(p.depth_cm) })],
    [
      t('report.reporter'),
      data.reporter ? (
        <>
          {data.reporter.display_name ?? data.reporter.code} · <span dir="ltr">{data.reporter.email}</span>
        </>
      ) : (
        t('report.anonymous')
      ),
    ],
    ...(p.reporter_contact ? [[t('report.contact'), <span dir="ltr">{p.reporter_contact}</span>] as [string, React.ReactNode]] : []),
    [t('report.coords'), <span dir="ltr">{`${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`}</span>],
  ]
  return (
    <Card aria-label={t('report.details')}>
      <dl className="m-0 grid gap-3 sm:grid-cols-[180px_1fr]">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-sm text-secondary">{k}</dt>
            <dd className="m-0">{v}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}

function History({ data }: { data: AdminReport }) {
  const { t, locale } = useI18n()
  const id = useId()
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {t('report.history')}
      </h2>
      <ol className="m-0 flex list-none flex-col gap-3 p-0">
        {data.history.map((h, i) => (
          <li key={i} className="flex gap-3">
            <span aria-hidden="true" className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" />
            <span className="flex flex-col">
              <span className="font-semibold">
                {t(`status.${h.to_status}`)} · {dateTime(h.at, locale)}
              </span>
              <span className="text-sm text-secondary">
                {h.actor_name ? t('report.by', { name: h.actor_name }) : t('report.fromApp')}
                {h.note && h.note !== 'Report submitted' ? ` · «${h.note}»` : ''}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </Card>
  )
}

function StatusForm({ data }: { data: AdminReport }) {
  const { t, locale } = useI18n()
  const current = data.pothole.status
  const change = useChangeStatus()
  const options = STATUS_ORDER.filter((s) => s !== current)
  const nextUp = STATUS_ORDER[STATUS_ORDER.indexOf(current) + 1]
  const [status, setStatus] = useState<PotholeStatus>(nextUp ?? options[0]!)
  const [note, setNote] = useState('')
  const [notify, setNotify] = useState(true)
  const [reasonMissing, setReasonMissing] = useState(false)
  const ids = { title: useId(), status: useId(), note: useId(), hint: useId() }
  const goingBack = STATUS_ORDER.indexOf(status) < STATUS_ORDER.indexOf(current)

  function submit(e: FormEvent) {
    e.preventDefault()
    const missing = goingBack && note.trim().length < REASON_MIN
    setReasonMissing(missing)
    if (missing) return
    change.mutate(
      { id: data.pothole.id, status, note: note.trim() || undefined, notify },
      {
        onSuccess: (res) => {
          setNote('')
          const after = STATUS_ORDER[STATUS_ORDER.indexOf(res.status) + 1]
          setStatus(after ?? STATUS_ORDER.find((s) => s !== res.status)!)
        },
      },
    )
  }

  let error: string | null = reasonMissing ? t('report.status.reasonMissing', { n: REASON_MIN }) : null
  if (!error && change.error instanceof ApiError) {
    error = change.error.status === 409 && !change.error.message.includes('already') ? t('report.status.conflict') : (locale === 'ar' && change.error.messageAr) || change.error.message
  } else if (!error && change.error) error = t('error.server')

  return (
    <Card aria-labelledby={ids.title}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-3">
        <h2 id={ids.title} className="m-0 text-[17px] font-semibold">
          {t('report.status.title')}
        </h2>
        <label htmlFor={ids.status} className="text-sm font-semibold">
          {t('report.status.new')}
        </label>
        <select id={ids.status} value={status} onChange={(e) => setStatus(e.target.value as PotholeStatus)} className="min-h-11 rounded-[10px] border border-strong bg-surface px-3">
          {options.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </select>
        <label htmlFor={ids.note} className="text-sm font-semibold">
          {t('report.status.note')} <span className="font-normal text-secondary">{t('report.status.noteHint')}</span>
        </label>
        <textarea
          id={ids.note}
          rows={3}
          maxLength={TEXT_LIMITS.statusNote}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('report.status.notePlaceholder')}
          aria-describedby={goingBack ? ids.hint : undefined}
          aria-invalid={reasonMissing || undefined}
          className="rounded-[10px] border border-strong bg-surface p-3"
        />
        {goingBack ? (
          <p id={ids.hint} className="m-0 text-sm text-warning">
            {t('report.status.backNeedsReason')}
          </p>
        ) : null}
        <label className="flex min-h-11 items-center gap-2">
          <input type="checkbox" className="size-5" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          {t('report.status.notify')}
        </label>
        {error ? <Alert>{error}</Alert> : null}
        <div aria-live="polite">{change.isSuccess && !change.isPending ? <Alert tone="success">{t('report.status.saved')}</Alert> : null}</div>
        <Button type="submit" variant="brand" disabled={change.isPending}>
          {change.isPending ? t('report.status.saving') : t('report.status.save')}
        </Button>
      </form>
    </Card>
  )
}

function CampaignCard({ data }: { data: AdminReport }) {
  const { t, number } = useI18n()
  const id = useId()
  const c = data.campaign
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-2">
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {t('report.campaign')}
      </h2>
      {c ? (
        <>
          <span className="w-fit rounded-full bg-subtle px-3 py-1 text-[13px] font-semibold">{t(`campaign.${c.status}`)}</span>
          <p className="m-0">{t('report.campaignProgress', { raised: number(c.confirmed_lyd), target: number(c.target_lyd), donors: number(c.donors_count) })}</p>
          <div className="h-2 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
            <div className="h-full bg-success" style={{ width: `${Math.min(100, (c.confirmed_lyd / c.target_lyd) * 100)}%` }} />
          </div>
        </>
      ) : (
        <p className="m-0 text-secondary">{t('report.noCampaign')}</p>
      )}
      {c && (c.status === 'active' || c.status === 'funded' || c.status === 'completed') ? (
        <Link to="/campaigns/$id" params={{ id: String(c.id) }} className="font-semibold">
          {t('report.openCampaign')}
        </Link>
      ) : data.pothole.status !== 'fixed' ? (
        <Link to="/campaigns/new" search={{ report: data.pothole.id }} className="font-semibold">
          {t('report.startCampaign')}
        </Link>
      ) : null}
    </Card>
  )
}

function Duplicates({ data }: { data: AdminReport }) {
  const { t, locale, number } = useI18n()
  const review = useReviewDuplicate(data.pothole.id)
  const id = useId()
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {t('report.duplicates')}
      </h2>
      {data.duplicates.length === 0 ? <p className="m-0 text-secondary">{t('report.noDuplicates')}</p> : null}
      {data.duplicates.map((d) => {
        const newer = d.this_is_newer ? data.pothole.id : d.other_id
        const older = d.this_is_newer ? d.other_id : data.pothole.id
        return (
          <div key={d.flag_id} className="flex flex-col gap-2 rounded-md bg-canvas p-3">
            <span className="flex flex-wrap items-center gap-2">
              <Link to="/reports/$id" params={{ id: String(d.other_id) }} className="font-semibold" dir="ltr">
                #{d.other_id}
              </Link>
              <StatusBadge status={d.other_status} label={t(`status.${d.other_status}`)} />
            </span>
            <span className="text-sm text-secondary">
              {pick(locale, d.other_street_ar, d.other_street_en) ?? t('queue.noStreet')} · {t('report.dupDistance', { m: number(Math.round(d.distance_m)) })} ·{' '}
              {dateTime(d.other_created_at, locale, false)}
            </span>
            <span className="text-sm">{t('dup.help', { newer: `\u2066#${newer}\u2069`, older: `\u2066#${older}\u2069` })}</span>
            <span className="flex flex-wrap gap-2">
              <Button variant="secondary" disabled={review.isPending} onClick={() => review.mutate({ flagId: d.flag_id, decision: 'confirmed' })}>
                {t('report.dupConfirm')}
              </Button>
              <Button variant="ghost" disabled={review.isPending} onClick={() => review.mutate({ flagId: d.flag_id, decision: 'rejected' })}>
                {t('report.dupReject')}
              </Button>
            </span>
          </div>
        )
      })}
      <div aria-live="polite">{review.isSuccess ? <Alert tone="success">{t('report.dupDone')}</Alert> : review.isError ? <Alert>{t('error.server')}</Alert> : null}</div>
    </Card>
  )
}

function DeleteReport({ id }: { id: number }) {
  const { t } = useI18n()
  const del = useDeleteReport()
  const navigate = useNavigate()
  const [asking, setAsking] = useState(false)
  if (!asking) {
    return (
      <Button variant="ghost" className="self-start text-danger!" onClick={() => setAsking(true)}>
        {t('report.delete')}
      </Button>
    )
  }
  return (
    <div role="alertdialog" aria-labelledby={`del-${id}`} className="flex flex-col gap-3 rounded-lg border border-danger bg-danger-bg p-4">
      <p id={`del-${id}`} className="m-0 font-semibold text-danger">
        {t('report.deleteConfirm', { id })}
      </p>
      {del.isError ? <Alert>{t('error.server')}</Alert> : null}
      <span className="flex gap-2">
        <Button
          variant="primary"
          disabled={del.isPending}
          onClick={() => del.mutate(id, { onSuccess: () => void navigate({ to: '/reports' }) })}
          autoFocus
        >
          {t('common.confirm')}
        </Button>
        <Button variant="secondary" onClick={() => setAsking(false)}>
          {t('common.cancel')}
        </Button>
      </span>
    </div>
  )
}
