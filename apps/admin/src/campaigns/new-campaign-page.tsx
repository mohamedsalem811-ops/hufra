import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useId, useState, type FormEvent } from 'react'

import { ApiError } from '@/api/client'
import { Alert, Button, Card, Spinner, StatusBadge } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { mediaUrl, pick } from '@/lib/format'
import { useReport } from '@/reports/use-reports'

import { CostItemsEditor, newItem, parseItems, PartnerSelect, sumLyd, type ItemDraft } from './cost-items'
import { useCreateCampaign } from './use-campaigns'

export function NewCampaignPage() {
  const { report } = useSearch({ from: '/campaigns/new' })
  const { t } = useI18n()
  if (!report) {
    return (
      <div className="flex flex-col items-start gap-3">
        <h1 className="m-0 text-[28px] font-bold">{t('camp.start')}</h1>
        <Alert tone="warning">{t('camp.noReport')}</Alert>
        <Link to="/reports" className="font-semibold">
          {t('queue.title')}
        </Link>
      </div>
    )
  }
  return <NewCampaignForm reportId={report} />
}

function NewCampaignForm({ reportId }: { reportId: number }) {
  const { t, locale, number } = useI18n()
  const report = useReport(reportId)
  const create = useCreateCampaign()
  const navigate = useNavigate()
  const [items, setItems] = useState<ItemDraft[]>(() => [newItem(t('camp.defaultMaterials')), newItem(t('camp.defaultLabour'))])
  const [contractor, setContractor] = useState('')
  const [partnerId, setPartnerId] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { contractor: useId(), note: useId(), exec: useId(), pv: useId(), rules: useId() }

  if (report.isPending) return <Spinner label={t('loading')} />
  if (report.isError) return <Alert>{t('report.notFound')}</Alert>
  const p = report.data.pothole
  const parsed = parseItems(items)
  const target = parsed ? sumLyd(parsed) : 0

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!parsed || parsed.length === 0) return setProblem(t('camp.itemsInvalid'))
    if (target <= 0) return setProblem(t('camp.targetInvalid'))
    setProblem(null)
    create.mutate(
      { pothole_id: reportId, target_lyd: target, cost_items: parsed, contractor: contractor.trim() || undefined, ...(partnerId ? { partner_id: partnerId } : {}), note_ar: note.trim() || undefined },
      { onSuccess: (res) => void navigate({ to: '/campaigns/$id', params: { id: String(res.campaign.id) } }) },
    )
  }

  const serverError = create.error instanceof ApiError ? (locale === 'ar' && create.error.messageAr) || create.error.message : create.error ? t('error.server') : null
  const cover = report.data.photos.find((ph) => ph.stage === 'report')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <nav aria-label={t('report.crumbs')} className="text-sm text-secondary">
          <Link to="/reports">{t('queue.title')}</Link> /{' '}
          <Link to="/reports/$id" params={{ id: String(p.id) }} dir="ltr">
            #{p.id}
          </Link>{' '}
          / {t('camp.newCrumb')}
        </nav>
        <h1 className="m-0 text-[28px] font-bold">{t('camp.start')}</h1>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-4">
          <Card className="flex items-center gap-3.5">
            {cover ? <img src={mediaUrl(cover.thumb_key)} alt="" className="size-16 shrink-0 rounded-[10px] object-cover" /> : <span className="size-16 shrink-0 rounded-[10px] bg-subtle" />}
            <span className="flex flex-1 flex-col gap-1">
              <span className="font-semibold">
                {pick(locale, p.street_ar, p.street_en) ?? t('queue.noStreet')}، {pick(locale, p.region_name_ar, p.region_name_en)}
              </span>
              <span className="text-[13px] text-secondary">
                <span dir="ltr">#{p.id}</span> · {t(`severity.${p.severity}`)}
              </span>
            </span>
            <StatusBadge status={p.status} label={t(`status.${p.status}`)} />
          </Card>

          <CostItemsEditor items={items} onChange={setItems} invalid={!!problem} />

          <fieldset className="m-0 grid gap-4 rounded-lg border border-default bg-surface p-4 sm:grid-cols-2" aria-labelledby={ids.exec}>
            <legend id={ids.exec} className="px-1.5 text-[17px] font-semibold">
              {t('camp.execution')}
            </legend>
            <div className="flex flex-col gap-2">
              <label htmlFor={ids.contractor} className="text-sm font-semibold">
                {t('camp.contractor')} <span className="font-normal text-secondary">{t('camp.optional')}</span>
              </label>
              <input id={ids.contractor} value={contractor} maxLength={120} onChange={(e) => setContractor(e.target.value)} placeholder={t('camp.contractorHint')} className="min-h-11 rounded-[10px] border border-strong bg-surface px-3" />
            </div>
            <PartnerSelect value={partnerId} onChange={setPartnerId} />
            <div className="flex flex-col gap-2 sm:col-span-2">
              <label htmlFor={ids.note} className="text-sm font-semibold">
                {t('camp.note')} <span className="font-normal text-secondary">{t('camp.noteHint')}</span>
              </label>
              <textarea id={ids.note} rows={2} value={note} maxLength={600} onChange={(e) => setNote(e.target.value)} placeholder={t('camp.notePlaceholder')} className="rounded-[10px] border border-strong bg-surface p-3" />
            </div>
          </fieldset>

          {problem ? <Alert>{problem}</Alert> : null}
          {serverError ? <Alert>{serverError}</Alert> : null}
          <Button type="submit" disabled={create.isPending} className="min-h-12 self-start px-6">
            {create.isPending ? t('camp.creating') : t('camp.create')}
          </Button>
        </form>

        <aside className="flex flex-col gap-4">
          <Card aria-labelledby={ids.pv} className="flex flex-col gap-3">
            <h2 id={ids.pv} className="m-0 text-[15px] font-semibold text-secondary">
              {t('camp.preview')}
            </h2>
            <div className="flex flex-col gap-2.5 rounded-[18px] border border-default p-3.5">
              <span className="font-bold">{t('report.campaign')}</span>
              <span className="flex items-baseline gap-1.5">
                <span className="text-2xl font-bold">0</span>
                <span className="text-sm text-secondary">{t('camp.previewAmount', { target: number(target) })}</span>
              </span>
              <div className="h-2.5 rounded-full bg-subtle" />
              <span className="flex min-h-12 items-center justify-center rounded-[14px] bg-action font-bold text-on-action">{t('camp.previewButton')}</span>
            </div>
          </Card>
          <section aria-labelledby={ids.rules} className="flex flex-col gap-2 rounded-lg bg-brand-tint p-4 text-sm leading-7">
            <h2 id={ids.rules} className="m-0 text-[15px] font-semibold">
              {t('camp.rules')}
            </h2>
            <ul className="m-0 flex list-disc flex-col gap-1 ps-5">
              {(['camp.rule1', 'camp.rule2', 'camp.rule3', 'camp.rule4'] as const).map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  )
}
