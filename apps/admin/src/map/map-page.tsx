import { potholeListResponseSchema, type PotholeStatus, type Severity } from '@hufra/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { lazy, Suspense, useId, useMemo, useState } from 'react'

import { useApi } from '@/api/api-provider'
import { Alert, Spinner, StatusBadge } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { pick } from '@/lib/format'
import { useRegions } from '@/reports/use-reports'

import type { Bounds, MapPoint } from './leaflet-map'

// Leaflet only loads when the map is opened.
const LeafletMap = lazy(() => import('./leaflet-map').then((m) => ({ default: m.LeafletMap })))

const LIMIT = 500
const STATUSES: PotholeStatus[] = ['reported', 'verified', 'under_repair', 'fixed']
const SEVERITIES: Severity[] = ['minor', 'medium', 'severe']
const select = 'min-h-11 rounded-[10px] border border-strong bg-surface px-3 text-[15px]'
const round = (n: number) => Math.round(n * 10000) / 10000

export function MapPage() {
  const { t, locale, number } = useI18n()
  const api = useApi()
  const navigate = useNavigate()
  const regions = useRegions()
  const [bounds, setBounds] = useState<Bounds | null>(null)
  const [status, setStatus] = useState<PotholeStatus | ''>('')
  const [severity, setSeverity] = useState<Severity | ''>('')
  const [regionId, setRegionId] = useState<number | ''>('')
  const listId = useId()

  const bbox = bounds ? [bounds.south, bounds.west, bounds.north, bounds.east].map(round).join(',') : null
  const reports = useQuery({
    queryKey: ['map', bbox, status, severity, regionId],
    enabled: !!bbox,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => {
      const q = new URLSearchParams({ bbox: bbox!, limit: String(LIMIT) })
      if (status) q.set('status', status)
      if (severity) q.set('severity', severity)
      if (regionId) q.set('region_id', String(regionId))
      return api.request(`/api/potholes?${q}`, { schema: potholeListResponseSchema, signal })
    },
    select: (d) => d.results,
  })

  const points: MapPoint[] = useMemo(
    () =>
      (reports.data ?? []).map((r) => ({
        id: r.id,
        lat: r.lat,
        lng: r.lng,
        status: r.status,
        title: `#${r.id} · ${pick(locale, r.street_ar, r.street_en) ?? t('queue.noStreet')}`,
        subtitle: `${t(`status.${r.status}`)} · ${t(`severity.${r.severity}`)} · ${pick(locale, r.region_name_ar, r.region_name_en)}`,
      })),
    [reports.data, locale, t]
  )
  const region = regions.data?.find((r) => r.id === regionId)
  const focus = useMemo(() => (region ? { lat: region.center_lat, lng: region.center_lng } : null), [region])
  const open = (id: number) => void navigate({ to: '/reports/$id', params: { id: String(id) } })
  const count = reports.data?.length ?? 0

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">{t('map.title')}</h1>
        <p className="m-0 text-sm text-secondary">{t('map.lead')}</p>
      </div>

      <div className="flex flex-wrap items-end gap-3" role="group" aria-label={t('map.filters')}>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('queue.status')}
          <select className={select} value={status} onChange={(e) => setStatus(e.target.value as PotholeStatus | '')}>
            <option value="">{t('queue.all')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('queue.severity')}
          <select className={select} value={severity} onChange={(e) => setSeverity(e.target.value as Severity | '')}>
            <option value="">{t('queue.all')}</option>
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {t(`severity.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          {t('queue.region')}
          <select className={select} value={regionId} onChange={(e) => setRegionId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">{t('queue.all')}</option>
            {regions.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {pick(locale, r.name_ar, r.name_en)}
              </option>
            ))}
          </select>
        </label>
        <ul aria-label={t('map.legend')} className="m-0 flex list-none flex-wrap gap-3 p-0 text-[13px]">
          {STATUSES.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-3 rounded-full border-2 border-white shadow" style={{ background: `var(--color-status-${s.replace('_', '-')}-pin)` }} />
              {t(`status.${s}`)}
            </li>
          ))}
        </ul>
      </div>

      <Suspense fallback={<Spinner label={t('loading')} />}>
        <LeafletMap points={points} onBounds={setBounds} onPick={open} openLabel={t('map.open')} label={t('map.region')} focus={focus} />
      </Suspense>

      <div aria-live="polite" className="text-sm text-secondary">
        {reports.isFetching ? t('loading') : reports.data ? (count >= LIMIT ? t('map.tooMany', { n: number(LIMIT) }) : t('map.count', { n: number(count) })) : ''}
      </div>
      {reports.isError ? <Alert>{t('error.server')}</Alert> : null}

      {count > 0 ? (
        <details className="rounded-lg border border-default bg-surface">
          <summary className="min-h-11 cursor-pointer px-4 py-3 font-semibold" id={listId}>
            {t('map.list', { n: number(count) })}
          </summary>
          <ul aria-labelledby={listId} className="m-0 flex list-none flex-col p-0">
            {reports.data!.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center gap-2 border-t border-subtle px-4 py-2.5">
                <Link to="/reports/$id" params={{ id: String(r.id) }} className="font-semibold">
                  <span dir="ltr">#{r.id}</span> · {pick(locale, r.street_ar, r.street_en) ?? t('queue.noStreet')}
                </Link>
                <StatusBadge status={r.status} label={t(`status.${r.status}`)} />
                <span className="text-[13px] text-secondary">{pick(locale, r.region_name_ar, r.region_name_en)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}
