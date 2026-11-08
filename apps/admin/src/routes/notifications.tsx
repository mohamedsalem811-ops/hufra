import { notificationListResponseSchema, okResponseSchema, type Notification } from '@hufra/contracts'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'

import { useApi } from '@/api/api-provider'
import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { dateTime, pick } from '@/lib/format'

type Payload = { title_ar?: string; title_en?: string; body_ar?: string; body_en?: string; pothole_id?: number; donation_id?: number; campaign_id?: number }

function readPayload(n: Notification): Payload {
  try {
    const p = JSON.parse(n.payload_json)
    return p && typeof p === 'object' ? p : {}
  } catch {
    return {}
  }
}

const id = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined)

/** Where a notification leads inside the panel (the stored url is for the old pages). */
function Target({ n, p }: { n: Notification; p: Payload }) {
  const { t } = useI18n()
  const cls = 'text-sm font-semibold'
  if (n.type.startsWith('donation') && id(p.donation_id)) {
    return <Link to="/donations" search={{ id: id(p.donation_id) }} className={cls}>{t('notif.openDonation')}</Link>
  }
  if (id(p.pothole_id)) {
    return <Link to="/reports/$id" params={{ id: String(p.pothole_id) }} className={cls}>{t('notif.openReport')}</Link>
  }
  if (n.type === 'payout_changed' || n.type === 'legal_published') {
    return <Link to="/settings" className={cls}>{t('notif.openSettings')}</Link>
  }
  return null
}

export function NotificationsPage() {
  const { t, locale, number } = useI18n()
  const api = useApi()
  const qc = useQueryClient()
  const list = useInfiniteQuery({
    queryKey: ['notifications'],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(`/api/notifications?limit=30${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ''}`, { schema: notificationListResponseSchema, signal }),
    getNextPageParam: (last) => last.next_cursor,
  })
  const readAll = useMutation({
    mutationFn: () => api.request('/api/notifications/read-all', { method: 'POST', body: {}, schema: okResponseSchema }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['admin-counts'] })
    },
  })
  const items = list.data?.pages.flatMap((p) => p.results) ?? []
  const unread = list.data?.pages[0]?.unread_count ?? 0

  return (
    <div className="flex max-w-3xl flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">{t('notif.title')}</h1>
          <p className="m-0 text-sm text-secondary">{unread ? t('notif.unread', { n: number(unread) }) : t('notif.allRead')}</p>
        </div>
        {unread ? (
          <Button variant="secondary" disabled={readAll.isPending} onClick={() => readAll.mutate()}>
            {t('notif.readAll')}
          </Button>
        ) : null}
      </div>
      {list.isPending ? <Spinner label={t('loading')} /> : null}
      {list.isError ? <Alert>{t('error.server')}</Alert> : null}
      {list.data && items.length === 0 ? <Card className="text-secondary">{t('notif.empty')}</Card> : null}
      {items.length ? (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((n) => {
            const p = readPayload(n)
            const isUnread = !n.read_at
            return (
              <li key={n.id} className={`flex flex-col gap-1 rounded-lg border bg-surface p-4 border-default ${isUnread ? 'border-s-4 border-s-brand' : ''}`}>
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold">
                    {isUnread ? <span className="sr-only">{t('notif.new')}: </span> : null}
                    {pick(locale, p.title_ar, p.title_en) ?? t('notif.generic')}
                  </span>
                  <time dateTime={n.created_at} className="text-[13px] text-secondary">
                    {dateTime(n.created_at, locale)}
                  </time>
                </span>
                {pick(locale, p.body_ar, p.body_en) ? <span className="text-sm text-secondary">{pick(locale, p.body_ar, p.body_en)}</span> : null}
                <Target n={n} p={p} />
              </li>
            )
          })}
        </ul>
      ) : null}
      {list.hasNextPage ? (
        <Button variant="secondary" className="self-start" disabled={list.isFetchingNextPage} onClick={() => list.fetchNextPage()}>
          {list.isFetchingNextPage ? t('loading') : t('notif.more')}
        </Button>
      ) : null}
    </div>
  )
}
