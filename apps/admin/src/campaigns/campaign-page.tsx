import type { adminCampaignSchema } from '@hufra/contracts'
import { Link, useParams } from '@tanstack/react-router'
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import type { z } from 'zod'

import { ApiError } from '@/api/client'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime, mediaUrl, pick } from '@/lib/format'

import { campaignTone, Progress } from './campaigns-page'
import { CostItemsEditor, newItem, parseItems, PartnerSelect, sumLyd, type ItemDraft } from './cost-items'
import { useAllocate, useCampaign, useUpdateCampaign, useUploadReceipt } from './use-campaigns'

type Campaign = z.infer<typeof adminCampaignSchema>
const AMOUNT = /^\d{1,8}(\.\d{1,3})?$/
const toNumber = (s: string) => (AMOUNT.test(s.trim()) ? Number(s.trim()) : null)

function useErrorText(error: unknown): string | null {
  const { t, locale } = useI18n()
  if (!error) return null
  return error instanceof ApiError ? (locale === 'ar' && error.messageAr) || error.message : t('error.server')
}

export function CampaignPage() {
  const { id } = useParams({ from: '/campaigns/$id' })
  const { t } = useI18n()
  const { campaign, data, isPending, isError, refetch } = useCampaign(Number(id))
  if (isPending) return <Spinner label={t('loading')} />
  if (isError) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert>{t('error.server')}</Alert>
        <Button variant="secondary" onClick={() => refetch()}>
          {t('error.retry')}
        </Button>
      </div>
    )
  }
  if (!campaign) return <Alert>{t('camp.notFound')}</Alert>
  return <CampaignView c={campaign} pool={data?.pool_lyd ?? 0} />
}

function CampaignView({ c, pool }: { c: Campaign; pool: number }) {
  const { t, locale, number } = useI18n()
  const open = c.status === 'active' || c.status === 'funded'
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <nav aria-label={t('report.crumbs')} className="text-sm text-secondary">
          <Link to="/campaigns">{t('camp.title')}</Link> / <span dir="ltr">#{c.pothole_id}</span>
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="m-0 text-[28px] font-bold">{pick(locale, c.street_ar, c.street_en) ?? t('queue.noStreet')}</h1>
          <span className={`rounded-full px-3 py-0.5 text-[13px] font-semibold ${campaignTone[c.status]}`}>{t(`campaign.${c.status}`)}</span>
        </div>
        <p className="m-0 text-sm text-secondary">
          {pick(locale, c.region_name_ar, c.region_name_en)} ·{' '}
          <Link to="/reports/$id" params={{ id: String(c.pothole_id) }}>
            {t('camp.report')} <span dir="ltr">#{c.pothole_id}</span>
          </Link>{' '}
          · {dateTime(c.created_at, locale, false)}
        </p>
      </div>

      <Card className="flex flex-col gap-2.5">
        <span className="text-xl font-bold">{t('camp.raised', { raised: number(c.confirmed_lyd), target: number(c.target_lyd) })}</span>
        <Progress raised={c.confirmed_lyd} target={c.target_lyd} />
        <span className="text-sm text-secondary">
          {t('camp.donors', { n: number(c.donors_count) })}
          {c.under_review_lyd > 0 ? ` · ${t('camp.underReview', { n: number(c.under_review_lyd) })}` : ''}
        </span>
        {c.close_reason ? <span className="text-sm">{t('camp.closeReason', { r: c.close_reason })}</span> : null}
      </Card>

      <div className={`grid items-start gap-5 ${open ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="flex min-w-0 flex-col gap-4">
          {open ? <EditCosts c={c} /> : <CostsSummary c={c} />}
          {c.status === 'completed' ? <Published c={c} /> : null}
        </div>
        <aside className="flex flex-col gap-4">
          {c.status === 'active' && pool > 0 ? <Allocate c={c} pool={pool} /> : null}
          {open ? <Complete c={c} /> : null}
          {open ? <Cancel c={c} /> : null}
        </aside>
      </div>
    </div>
  )
}

function CostsSummary({ c }: { c: Campaign }) {
  const { t, number } = useI18n()
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="m-0 text-[17px] font-semibold">{t('camp.costs')}</h2>
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {c.cost_items.map((i, n) => (
          <li key={n} className="flex justify-between gap-3">
            <span>{i.label}</span>
            <span className="font-semibold">
              {number(i.amount_lyd)} {t('money.lyd')}
            </span>
          </li>
        ))}
      </ul>
      <span className="flex justify-between border-t border-default pt-2 font-bold">
        <span>{t('camp.target')}</span>
        <span>
          {number(c.target_lyd)} {t('money.lyd')}
        </span>
      </span>
      {c.contractor ? <span className="text-sm text-secondary">{`${t('camp.contractor')}: ${c.contractor}`}</span> : null}
    </Card>
  )
}

function EditCosts({ c }: { c: Campaign }) {
  const { t } = useI18n()
  const update = useUpdateCampaign(c.id)
  const [items, setItems] = useState<ItemDraft[]>(() =>
    c.cost_items.length ? c.cost_items.map((i) => newItem(i.label, String(i.amount_lyd))) : [newItem(t('camp.repairCost'), String(c.target_lyd))],
  )
  const [contractor, setContractor] = useState(c.contractor ?? '')
  const [partnerId, setPartnerId] = useState<number | null>(c.partner_id)
  const [problem, setProblem] = useState<string | null>(null)
  const contractorId = useId()
  const error = useErrorText(update.error)

  function save(e: FormEvent) {
    e.preventDefault()
    const parsed = parseItems(items)
    if (!parsed?.length) return setProblem(t('camp.itemsInvalid'))
    if (sumLyd(parsed) <= 0) return setProblem(t('camp.targetInvalid'))
    setProblem(null)
    update.mutate({ cost_items: parsed, contractor: contractor.trim(), ...(partnerId !== c.partner_id ? { partner_id: partnerId } : {}) })
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-3">
      <CostItemsEditor items={items} onChange={setItems} invalid={!!problem} />
      <div className="flex flex-col gap-2">
        <label htmlFor={contractorId} className="text-sm font-semibold">
          {t('camp.contractor')} <span className="font-normal text-secondary">{t('camp.optional')}</span>
        </label>
        <input id={contractorId} value={contractor} maxLength={120} onChange={(e) => setContractor(e.target.value)} className="min-h-11 rounded-[10px] border border-strong bg-surface px-3" />
      </div>
      <PartnerSelect value={partnerId} onChange={setPartnerId} />
      {problem ? <Alert>{problem}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <div aria-live="polite">{update.isSuccess ? <Alert tone="success">{t('camp.saved')}</Alert> : null}</div>
      <Button type="submit" variant="brand" disabled={update.isPending} className="self-start">
        {t('camp.saveCosts')}
      </Button>
    </form>
  )
}

function SideForm({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit: (e: FormEvent) => void }) {
  const id = useId()
  return (
    <Card aria-labelledby={id}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-3">
        <h2 id={id} className="m-0 text-[17px] font-semibold">
          {title}
        </h2>
        {children}
      </form>
    </Card>
  )
}

function AmountField({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const id = useId()
  const hintId = useId()
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold">
        {label}
      </label>
      <input id={id} inputMode="decimal" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={hint ? hintId : undefined} className="min-h-11 max-w-[200px] rounded-[10px] border border-strong bg-surface px-3" />
      {hint ? (
        <span id={hintId} className="text-sm text-secondary">
          {hint}
        </span>
      ) : null}
    </div>
  )
}

function Allocate({ c, pool }: { c: Campaign; pool: number }) {
  const { t, number } = useI18n()
  const allocate = useAllocate(c.id)
  const [amount, setAmount] = useState('')
  const error = useErrorText(allocate.error)
  const value = toNumber(amount)
  return (
    <SideForm
      title={t('camp.allocate')}
      onSubmit={(e) => {
        e.preventDefault()
        if (value && value > 0) allocate.mutate(value, { onSuccess: () => setAmount('') })
      }}
    >
      <AmountField label={t('camp.allocateAmount')} value={amount} onChange={setAmount} hint={t('camp.allocateHint', { n: number(pool) })} />
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" variant="secondary" disabled={!value || allocate.isPending}>
        {t('camp.allocateDo')}
      </Button>
    </SideForm>
  )
}

function Complete({ c }: { c: Campaign }) {
  const { t } = useI18n()
  const update = useUpdateCampaign(c.id)
  const [cost, setCost] = useState(String(c.target_lyd))
  const error = useErrorText(update.error)
  const value = toNumber(cost)
  return (
    <SideForm
      title={t('camp.complete')}
      onSubmit={(e) => {
        e.preventDefault()
        if (value !== null) update.mutate({ status: 'completed', final_cost_lyd: value })
      }}
    >
      <AmountField label={t('camp.finalCost')} value={cost} onChange={setCost} hint={t('camp.completeHint')} />
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" variant="brand" disabled={value === null || update.isPending}>
        {t('camp.completeDo')}
      </Button>
    </SideForm>
  )
}

function Cancel({ c }: { c: Campaign }) {
  const { t } = useI18n()
  const update = useUpdateCampaign(c.id)
  const [reason, setReason] = useState('')
  const [missing, setMissing] = useState(false)
  const id = useId()
  const hint = useId()
  const error = useErrorText(update.error)
  return (
    <SideForm
      title={t('camp.cancel')}
      onSubmit={(e) => {
        e.preventDefault()
        setMissing(!reason.trim())
        if (reason.trim()) update.mutate({ status: 'cancelled', reason: reason.trim() })
      }}
    >
      <label htmlFor={id} className="text-sm font-semibold">
        {t('camp.cancelReason')}
      </label>
      <textarea id={id} rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} aria-describedby={hint} aria-invalid={missing || undefined} className="rounded-[10px] border border-strong bg-surface p-3" />
      <span id={hint} className="text-sm text-secondary">
        {t('camp.cancelHint')}
      </span>
      {missing ? <Alert>{t('camp.reasonMissing')}</Alert> : null}
      {error ? <Alert>{error}</Alert> : null}
      <Button type="submit" variant="ghost" className="self-start text-danger!" disabled={update.isPending}>
        {t('camp.cancelDo')}
      </Button>
    </SideForm>
  )
}

function Published({ c }: { c: Campaign }) {
  const { t, number } = useI18n()
  const receipt = useUploadReceipt(c.id)
  const id = useId()
  const error = useErrorText(receipt.error)
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {t('camp.published')}
      </h2>
      <p className="m-0 font-semibold">{c.final_cost_lyd === null ? t('camp.noFinalCost') : t('camp.finalCostValue', { n: number(c.final_cost_lyd) })}</p>
      <h3 className="m-0 text-[15px] font-semibold">{t('camp.receipt')}</h3>
      {c.receipt_key ? (
        <a href={mediaUrl(c.receipt_key)} target="_blank" rel="noreferrer" className="block w-fit">
          <img src={mediaUrl(c.receipt_key)} alt={t('camp.receiptAlt')} className="max-h-72 rounded-md border border-default" />
        </a>
      ) : null}
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center rounded-[10px] border-[1.5px] border-brand px-4 font-semibold text-brand focus-within:outline-3 focus-within:outline-focus">
        {c.receipt_key ? t('camp.receiptReplace') : t('camp.receiptAdd')}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          disabled={receipt.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (file) receipt.mutate(file)
          }}
        />
      </label>
      <div aria-live="polite">
        {receipt.isPending ? <Alert tone="success">{t('report.uploading')}</Alert> : receipt.isSuccess ? <Alert tone="success">{t('report.uploaded')}</Alert> : null}
      </div>
      {error ? <Alert>{error}</Alert> : null}
    </Card>
  )
}
