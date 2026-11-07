import { countersResponseSchema } from '@hufra/contracts'
import { useQuery } from '@tanstack/react-query'

import { useApi } from '@/api/api-provider'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'

/** 8.1: the typed client end to end. Charts, queues and to-dos come in 8.2. */
export function DashboardPage() {
  const { t, number } = useI18n()
  const api = useApi()
  const counters = useQuery({
    queryKey: ['counters'],
    queryFn: ({ signal }) => api.request('/api/potholes/counters', { schema: countersResponseSchema, signal }),
  })

  const totals = counters.data?.totals
  const tiles: { label: MessageKey; value: number | undefined; tone?: string }[] = totals
    ? [
        { label: 'dashboard.total', value: totals.total },
        { label: 'dashboard.open', value: (totals.reported ?? 0) + (totals.verified ?? 0) + (totals.under_repair ?? 0) },
        { label: 'dashboard.fixed', value: totals.fixed ?? 0, tone: 'text-success' },
      ]
    : []

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[28px] font-bold">{t('dashboard.title')}</h1>
        <p className="m-0 text-sm text-secondary">{t('dashboard.scope')}</p>
      </div>
      {counters.isPending ? <Spinner label={t('loading')} /> : null}
      {counters.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>{t('error.server')}</Alert>
          <Button variant="secondary" onClick={() => counters.refetch()}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}
      {totals ? (
        <section aria-label={t('dashboard.numbers')} className="grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3.5">
          {tiles.map((tile) => (
            <Card key={tile.label} className="flex flex-col gap-1.5">
              <span className="text-sm text-secondary">{t(tile.label)}</span>
              <span className={`text-[32px] font-bold leading-tight ${tile.tone ?? ''}`}>{number(tile.value ?? 0)}</span>
            </Card>
          ))}
        </section>
      ) : null}
    </div>
  )
}
