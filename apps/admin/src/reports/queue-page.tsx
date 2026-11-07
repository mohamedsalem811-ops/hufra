import { STATUS_ORDER, type PotholeStatus, type ReportQueueItem } from '@hufra/contracts'
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useId, useState } from 'react'

import { Alert, Button, Spinner, StatusBadge } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { age, mediaUrl, pick } from '@/lib/format'

import { PAGE_SIZE, useBulkStatus, useQueue, useRegions, type QueueFilters } from './use-reports'

const select = 'min-h-11 rounded-[10px] border border-strong bg-surface px-3 text-[15px] text-primary'

export function QueuePage() {
  const { t, locale, number } = useI18n()
  const search = useSearch({ from: '/reports' })
  const navigate = useNavigate({ from: '/reports' })
  const queue = useQueue(search)
  const regions = useRegions()
  const bulk = useBulkStatus()
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [text, setText] = useState(search.q ?? '')
  const searchId = useId()

  const setFilters = (change: Partial<QueueFilters>) => {
    setSelected(new Set())
    void navigate({ search: (prev: QueueFilters) => ({ ...prev, ...change, page: 'page' in change ? change.page : undefined }), replace: true })
  }

  // Search as you type, after a short pause.
  useEffect(() => {
    const next = text.trim() || undefined
    if (next === search.q) return
    const timer = setTimeout(() => setFilters({ q: next }), 300)
    return () => clearTimeout(timer)
  })

  const rows = queue.data?.results ?? []
  const total = queue.data?.total ?? 0
  const page = search.page ?? 1
  const allChosen = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const toggle = (id: number) =>
    setSelected((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const filtered = !!(search.q || search.status || search.severity || search.region_id || search.duplicates || search.sort)

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">{t('queue.title')}</h1>
        <p className="m-0 text-sm text-secondary" aria-live="polite">
          {queue.data ? t('queue.count', { n: number(total) }) : ' '}
        </p>
      </div>

      <div role="search" aria-label={t('queue.filters')} className="flex flex-wrap items-end gap-2.5">
        <div className="flex min-w-[240px] flex-1 flex-col gap-1">
          <label htmlFor={searchId} className="text-sm text-secondary">
            {t('queue.search')}
          </label>
          <input id={searchId} type="search" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('queue.searchHint')} className={select} />
        </div>
        <Filter label={t('queue.status')} value={search.status ?? ''} onChange={(v) => setFilters({ status: (v || undefined) as PotholeStatus | undefined })}>
          <option value="">{t('queue.all')}</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {t(`status.${s}`)}
            </option>
          ))}
        </Filter>
        <Filter label={t('queue.severity')} value={search.severity ?? ''} onChange={(v) => setFilters({ severity: (v || undefined) as QueueFilters['severity'] })}>
          <option value="">{t('queue.all')}</option>
          {(['severe', 'medium', 'minor'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`severity.${s}`)}
            </option>
          ))}
        </Filter>
        <Filter label={t('queue.region')} value={search.region_id ? String(search.region_id) : ''} onChange={(v) => setFilters({ region_id: v ? Number(v) : undefined })}>
          <option value="">{t('queue.all')}</option>
          {(regions.data ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {pick(locale, r.name_ar, r.name_en)}
            </option>
          ))}
        </Filter>
        <Filter label={t('queue.sort')} value={search.sort ?? 'newest'} onChange={(v) => setFilters({ sort: v === 'newest' ? undefined : (v as QueueFilters['sort']) })}>
          {(['newest', 'oldest', 'most_confirmed'] as const).map((s) => (
            <option key={s} value={s}>
              {t(`queue.sort.${s}`)}
            </option>
          ))}
        </Filter>
        <label className="flex min-h-11 items-center gap-2 text-[15px]">
          <input type="checkbox" className="size-5" checked={!!search.duplicates} onChange={(e) => setFilters({ duplicates: e.target.checked ? '1' : undefined })} />
          {t('queue.duplicatesOnly')}
        </label>
        {filtered ? (
          <Button
            variant="ghost"
            onClick={() => {
              setText('')
              setSelected(new Set())
              void navigate({ search: {}, replace: true })
            }}
          >
            {t('queue.clear')}
          </Button>
        ) : null}
      </div>

      {selected.size > 0 ? (
        <div role="region" aria-label={t('bulk.label')} className="flex flex-wrap items-center gap-2.5 rounded-md bg-brand-tint px-4 py-3">
          <span className="font-semibold">{t('bulk.selected', { n: number(selected.size) })}</span>
          {(['verified', 'under_repair', 'fixed'] as const).map((s) => (
            <Button
              key={s}
              variant="secondary"
              disabled={bulk.isPending}
              onClick={() => bulk.mutate({ ids: [...selected], status: s }, { onSuccess: () => setSelected(new Set()) })}
            >
              {t('bulk.moveTo', { status: t(`status.${s}`) })}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setSelected(new Set())}>
            {t('bulk.clear')}
          </Button>
        </div>
      ) : null}
      {bulk.data ? (
        <Alert tone={bulk.data.failed.length ? 'warning' : 'success'}>
          {t('bulk.done', { ok: number(bulk.data.ok), n: number(bulk.data.ok + bulk.data.failed.length) })}
          {bulk.data.failed.length ? ` ${t('bulk.someFailed', { ids: bulk.data.failed.map((i) => `#${i}`).join('، ') })}` : ''}
        </Alert>
      ) : null}

      {queue.isPending ? <Spinner label={t('loading')} /> : null}
      {queue.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>{t('error.server')}</Alert>
          <Button variant="secondary" onClick={() => queue.refetch()}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}

      {queue.data && rows.length === 0 ? <p className="rounded-lg border border-default bg-surface p-6 text-secondary">{t('queue.empty')}</p> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-default bg-surface">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="text-start text-sm text-secondary">
                <th scope="col" className="w-12 border-b border-default p-3">
                  <input
                    type="checkbox"
                    className="size-5"
                    aria-label={t('queue.selectAll')}
                    checked={allChosen}
                    onChange={() => setSelected(allChosen ? new Set() : new Set(rows.map((r) => r.id)))}
                  />
                </th>
                {(['report', 'status', 'severity', 'upvotes', 'age', 'campaign'] as const).map((c) => (
                  <th key={c} scope="col" className="border-b border-default p-3 text-start font-semibold">
                    {t(`queue.col.${c}`)}
                  </th>
                ))}
                <th scope="col" className="border-b border-default p-3">
                  <span className="sr-only">{t('queue.col.actions')}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.id} row={r} chosen={selected.has(r.id)} onToggle={() => toggle(r.id)} />
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > PAGE_SIZE ? (
        <nav aria-label={t('queue.pages')} className="flex flex-wrap items-center justify-between gap-3 text-sm text-secondary">
          <span>
            {t('queue.range', {
              from: number((page - 1) * PAGE_SIZE + 1),
              to: number(Math.min(page * PAGE_SIZE, total)),
              total: number(total),
            })}
          </span>
          <span className="flex gap-2">
            <Button variant="secondary" disabled={page <= 1} onClick={() => setFilters({ page: page - 1 })}>
              {t('queue.prev')}
            </Button>
            <Button variant="secondary" disabled={page * PAGE_SIZE >= total} onClick={() => setFilters({ page: page + 1 })}>
              {t('queue.next')}
            </Button>
          </span>
        </nav>
      ) : null}
    </div>
  )
}

function Filter({ label, value, onChange, children }: { label: string; value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-secondary">
        {label}
      </label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={select}>
        {children}
      </select>
    </div>
  )
}

function Row({ row, chosen, onToggle }: { row: ReportQueueItem; chosen: boolean; onToggle: () => void }) {
  const { t, locale, number } = useI18n()
  const street = pick(locale, row.street_ar, row.street_en) ?? t('queue.noStreet')
  return (
    <tr className={chosen ? 'bg-brand-tint' : undefined}>
      <td className="border-b border-subtle p-3">
        <input type="checkbox" className="size-5" checked={chosen} onChange={onToggle} aria-label={t('queue.select', { id: row.id })} />
      </td>
      <td className="border-b border-subtle p-3">
        <span className="flex items-center gap-3">
          {row.cover_thumb_key ? (
            <img src={mediaUrl(row.cover_thumb_key)} alt="" className="size-11 shrink-0 rounded-md object-cover" loading="lazy" />
          ) : (
            <span aria-hidden="true" className="size-11 shrink-0 rounded-md bg-subtle" />
          )}
          <span className="flex flex-col">
            <Link to="/reports/$id" params={{ id: String(row.id) }} className="font-semibold">
              {street}
            </Link>
            <span className="text-sm text-secondary">
              {pick(locale, row.region_name_ar, row.region_name_en)} · <span dir="ltr">#{row.id}</span>
            </span>
          </span>
        </span>
      </td>
      <td className="border-b border-subtle p-3">
        <span className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status={row.status} label={t(`status.${row.status}`)} />
          {row.duplicate_flag_count > 0 ? (
            <span className="inline-flex h-7 items-center rounded-full bg-subtle px-3 text-[13px] font-semibold text-secondary">{t('queue.maybeDuplicate')}</span>
          ) : null}
        </span>
      </td>
      <td className="border-b border-subtle p-3">{t(`severity.${row.severity}`)}</td>
      <td className="border-b border-subtle p-3">{number(row.upvotes_count)}</td>
      <td className="border-b border-subtle p-3 whitespace-nowrap">{age(row.created_at, t)}</td>
      <td className="border-b border-subtle p-3 whitespace-nowrap">
        {row.campaign ? (
          row.campaign.status === 'active' ? (
            `${number(row.campaign.confirmed_lyd)} / ${number(row.campaign.target_lyd)} ${t('money.lyd')}`
          ) : (
            t(`campaign.${row.campaign.status}`)
          )
        ) : (
          <span aria-hidden="true">—</span>
        )}
      </td>
      <td className="border-b border-subtle p-3">
        <Link to="/reports/$id" params={{ id: String(row.id) }} aria-label={t('queue.openReport', { id: row.id })} className="font-semibold">
          {t('queue.open')}
        </Link>
      </td>
    </tr>
  )
}

