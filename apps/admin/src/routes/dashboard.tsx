import { dashboardResponseSchema, DASHBOARD_PERIODS, type Dashboard, type PotholeStatus } from '@hufra/contracts'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useId, useState, type ReactNode } from 'react'

import { useApi } from '@/api/api-provider'
import { Alert, Button, Card, ScrollArea, Spinner } from '@/components/ui'
import { Icon } from '@/components/icons'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'
import { age, dateTime, pick } from '@/lib/format'

type Days = (typeof DASHBOARD_PERIODS)[number]
const STATUSES: PotholeStatus[] = ['reported', 'verified', 'under_repair', 'fixed']
const pin = (s: PotholeStatus) => `var(--color-status-${s.replace('_', '-')}-pin)`

export function DashboardPage() {
  const { t } = useI18n()
  const api = useApi()
  const [days, setDays] = useState<Days>(30)
  const dash = useQuery({
    queryKey: ['dashboard', days],
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) => api.request(`/api/admin/dashboard?days=${days}`, { schema: dashboardResponseSchema, signal }),
  })

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">{t('dashboard.title')}</h1>
          <p className="m-0 text-sm text-secondary">{t('dashboard.scope')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          <label className="flex flex-col gap-1 text-[13px] font-semibold text-secondary">
            {t('dash.period')}
            <select className="min-h-11 rounded-[10px] border border-strong bg-surface px-3 text-[15px] text-primary" value={days} onChange={(e) => setDays(Number(e.target.value) as Days)}>
              {DASHBOARD_PERIODS.map((d) => (
                <option key={d} value={d}>
                  {t(`dash.days.${d}` as MessageKey)}
                </option>
              ))}
            </select>
          </label>
          <a href={`/api/admin/export/reports.csv?days=${days}`} download className="inline-flex min-h-11 items-center gap-2 rounded-[10px] border-[1.5px] border-brand bg-surface px-4 font-semibold text-brand no-underline hover:bg-brand-tint">
            <Icon name="download" />
            {t('dash.csv')}
          </a>
        </div>
      </div>
      {dash.isPending ? <Spinner label={t('loading')} /> : null}
      {dash.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>{t('error.server')}</Alert>
          <Button variant="secondary" onClick={() => dash.refetch()}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}
      {dash.data ? <DashboardView d={dash.data} /> : null}
    </div>
  )
}

function DashboardView({ d }: { d: Dashboard }) {
  const { t, locale, number } = useI18n()
  const x = d.tiles
  const diff = x.new_reports - x.new_reports_previous
  return (
    <>
      <section aria-label={t('dashboard.numbers')} className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3.5">
        <Tile label={t('dash.new')} value={number(x.new_reports)} note={t('dash.vsPrevious', { n: `${diff > 0 ? '+' : diff < 0 ? '−' : ''}${number(Math.abs(diff))}` })} />
        <Tile label={t('dash.waiting')} value={number(x.awaiting_verification)} note={!x.oldest_waiting_at ? t('dash.noneWaiting') : age(x.oldest_waiting_at, t) === t('ago.today') ? t('dash.oldestToday') : t('dash.oldest', { age: age(x.oldest_waiting_at, t) })} />
        <Tile label={t('dash.underRepair')} value={number(x.under_repair)} note={t('dash.inRegions', { n: number(x.under_repair_regions) })} />
        <Tile label={t('dash.fixed')} value={number(x.fixed)} tone="text-success" note={x.avg_fix_days === null ? t('dash.noFixes') : t('dash.avgFix', { n: number(x.avg_fix_days) })} />
        <Tile
          label={t('dash.donations')}
          value={
            <>
              {number(x.confirmed_lyd)} <span className="text-base font-semibold">{t('money.lyd')}</span>
            </>
          }
          note={t('dash.underReview', { n: number(x.under_review_lyd) })}
        />
      </section>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Weekly weeks={d.weekly} />
        <ByStatus d={d} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Todo todo={d.todo} />
        <Card aria-labelledby="dash-regions" className="flex flex-col gap-3">
          <h2 id="dash-regions" className="m-0 text-[17px] font-semibold">
            {t('dash.byRegion')}
          </h2>
          {d.by_region.length === 0 ? (
            <p className="m-0 text-secondary">{t('dash.noRegions')}</p>
          ) : (
            <ScrollArea labelledBy="dash-regions">
              <table className="w-full min-w-[420px] border-collapse text-sm">
                <thead>
                  <tr className="text-secondary">
                    <th scope="col" className="py-2 text-start font-semibold">{t('queue.region')}</th>
                    <th scope="col" className="p-2 text-start font-semibold">{t('dash.open')}</th>
                    <th scope="col" className="p-2 text-start font-semibold">{t('dash.fixedPeriod')}</th>
                    <th scope="col" className="p-2 text-start font-semibold">{t('dash.avgCol')}</th>
                  </tr>
                </thead>
                <tbody>
                  {d.by_region.map((r) => (
                    <tr key={r.id} className="border-t border-subtle">
                      <th scope="row" className="py-2.5 text-start font-normal">
                        <Link to="/reports" search={{ region_id: r.id }}>
                          {pick(locale, r.name_ar, r.name_en)}
                        </Link>
                      </th>
                      <td className="p-2 font-semibold">{number(r.open)}</td>
                      <td className="p-2">{number(r.fixed)}</td>
                      <td className="p-2">{r.avg_fix_days === null ? '—' : t('dash.daysN', { n: number(r.avg_fix_days) })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          )}
        </Card>
      </div>
      <p className="m-0 text-[13px] text-secondary">{t('dash.periodNote', { from: dateTime(new Date(Date.now() - d.days * 86400000).toISOString(), locale, false) })}</p>
    </>
  )
}

function Tile({ label, value, note, tone }: { label: string; value: ReactNode; note: string; tone?: string }) {
  return (
    <Card className="flex flex-col gap-1.5">
      <span className="text-sm text-secondary">{label}</span>
      <span className={`text-[32px] font-bold leading-tight ${tone ?? ''}`}>{value}</span>
      <span className="text-[13px] text-secondary">{note}</span>
    </Card>
  )
}

/** New reports per week: one series, so one brand colour and no legend; hover or focus a bar for its number. */
function Weekly({ weeks }: { weeks: Dashboard['weekly'] }) {
  const { t, locale, number } = useI18n()
  const [asTable, setAsTable] = useState(false)
  const [hover, setHover] = useState<number | null>(null)
  const id = useId()
  const max = Math.max(1, ...weeks.map((w) => w.count))
  const label = (w: Dashboard['weekly'][number]) => t('dash.weekOf', { date: dateTime(`${w.week_start}T12:00:00Z`, locale, false) })
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={id} className="m-0 text-[17px] font-semibold">
          {t('dash.weekly')}
        </h2>
        <button type="button" className="text-sm font-semibold text-link" aria-pressed={asTable} onClick={() => setAsTable((v) => !v)}>
          {asTable ? t('dash.asChart') : t('dash.asTable')}
        </button>
      </div>
      {asTable ? (
        <table aria-labelledby={id} className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-secondary">
              <th scope="col" className="py-1.5 text-start font-semibold">{t('dash.week')}</th>
              <th scope="col" className="py-1.5 text-start font-semibold">{t('dash.newCol')}</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week_start} className="border-t border-subtle">
                <td className="py-1.5">{label(w)}</td>
                <td className="py-1.5 font-semibold">{number(w.count)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <>
          <div role="img" aria-label={t('dash.weeklyAlt', { n: number(weeks.at(-1)?.count ?? 0), max: number(max) })} className="relative">
            <div className="flex h-44 items-end gap-[2px] border-b border-default" onMouseLeave={() => setHover(null)}>
              {weeks.map((w, i) => (
                <div key={w.week_start} className="relative flex h-full flex-1 items-end" onMouseEnter={() => setHover(i)}>
                  <div
                    className={`w-full rounded-t-[4px] ${i === weeks.length - 1 ? 'bg-brand' : 'bg-brand/60'} ${hover === i ? 'outline-2 outline-focus' : ''}`}
                    style={{ height: w.count ? `${Math.max(3, (w.count / max) * 100)}%` : '2px' }}
                  />
                </div>
              ))}
            </div>
            {hover !== null ? (
              <div className="pointer-events-none absolute top-0 rounded-md bg-primary px-2 py-1 text-xs whitespace-nowrap text-inverse" style={{ insetInlineStart: `${(hover / weeks.length) * 100}%` }}>
                {label(weeks[hover]!)}: {number(weeks[hover]!.count)}
              </div>
            ) : null}
          </div>
          <div className="flex justify-between text-xs text-secondary">
            <span>{t('dash.weeksAgo')}</span>
            <span>{t('dash.thisWeek')}</span>
          </div>
        </>
      )}
    </Card>
  )
}

/** One segmented bar of all reports by status, with a labelled legend carrying the numbers. */
function ByStatus({ d }: { d: Dashboard }) {
  const { t, number } = useI18n()
  const id = useId()
  const total = STATUSES.reduce((n, s) => n + d.by_status[s], 0)
  return (
    <Card aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="m-0 text-[17px] font-semibold">
        {t('dash.byStatus')}
      </h2>
      <div role="img" aria-label={STATUSES.map((s) => `${t(`status.${s}`)} ${number(d.by_status[s])}`).join('، ')} className="flex h-4 gap-[2px] overflow-hidden rounded-full bg-subtle">
        {total > 0
          ? STATUSES.filter((s) => d.by_status[s] > 0).map((s) => <span key={s} title={`${t(`status.${s}`)}: ${number(d.by_status[s])}`} style={{ width: `${(d.by_status[s] / total) * 100}%`, background: pin(s) }} />)
          : null}
      </div>
      <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 text-sm">
        {STATUSES.map((s) => (
          <li key={s} className="flex items-center gap-2">
            <span aria-hidden="true" className="size-3 shrink-0 rounded-full" style={{ background: pin(s) }} />
            {t(`status.${s}`)}
            <span className="ms-auto font-bold">{number(d.by_status[s])}</span>
          </li>
        ))}
      </ul>
      <p className="m-0 border-t border-subtle pt-3 text-sm">
        {t('dash.campaigns', { n: number(d.campaigns.open) })} · {t('dash.missing', { n: number(d.campaigns.missing_lyd) })}
      </p>
    </Card>
  )
}

const row = 'flex min-h-12 items-center gap-3 rounded-[10px] bg-canvas px-3 py-2 text-primary no-underline hover:bg-brand-tint'

function TodoText({ dot, text, action }: { dot: string; text: string; action: string }) {
  return (
    <>
      <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full ${dot}`} />
      <span className="flex-1 text-[15px]">{text}</span>
      <span className="text-sm font-semibold text-link">{action}</span>
    </>
  )
}

/** Only what is waiting; nothing listed when all is done. */
function Todo({ todo }: { todo: Dashboard['todo'] }) {
  const { t, number } = useI18n()
  const none = !todo.stale_reports && !todo.donations_to_review && !todo.funded_campaigns && !todo.duplicates
  return (
    <Card aria-labelledby="dash-todo" className="flex flex-col gap-2">
      <h2 id="dash-todo" className="m-0 mb-1 text-[17px] font-semibold">
        {t('dash.todo')}
      </h2>
      {none ? <p className="m-0 text-secondary">{t('dash.todoNone')}</p> : null}
      {todo.stale_reports ? (
        <Link to="/reports" search={{ status: 'reported', sort: 'oldest' }} className={row}>
          <TodoText dot="bg-action" text={t('dash.todoStale', { n: number(todo.stale_reports) })} action={t('dash.review')} />
        </Link>
      ) : null}
      {todo.donations_to_review ? (
        <Link to="/donations" className={row}>
          <TodoText dot="bg-action" text={t('dash.todoDonations', { n: number(todo.donations_to_review) })} action={t('dash.review')} />
        </Link>
      ) : null}
      {todo.funded_campaigns ? (
        <Link to="/campaigns" className={row}>
          <TodoText dot="bg-success" text={t('dash.todoFunded', { n: number(todo.funded_campaigns) })} action={t('dash.openAction')} />
        </Link>
      ) : null}
      {todo.duplicates ? (
        <Link to="/duplicates" className={row}>
          <TodoText dot="bg-brand" text={t('dash.todoDuplicates', { n: number(todo.duplicates) })} action={t('dash.compare')} />
        </Link>
      ) : null}
    </Card>
  )
}
