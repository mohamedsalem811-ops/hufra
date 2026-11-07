import type { z } from 'zod'
import type { adminCampaignSchema } from '@hufra/contracts'
import { Link } from '@tanstack/react-router'
import { useState } from 'react'

import { Alert, Button, Card, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { pick } from '@/lib/format'

import { useCampaigns } from './use-campaigns'

type Campaign = z.infer<typeof adminCampaignSchema>

export function Progress({ raised, target }: { raised: number; target: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-subtle" aria-hidden="true">
      <div className="h-full rounded-full bg-success" style={{ width: `${target > 0 ? Math.min(100, (raised / target) * 100) : 0}%` }} />
    </div>
  )
}

export const campaignTone: Record<Campaign['status'], string> = {
  active: 'bg-verified-bg text-verified',
  funded: 'bg-success-bg text-success',
  completed: 'bg-success text-white',
  cancelled: 'bg-danger-bg text-danger',
}

export function CampaignsPage() {
  const { t, locale, number } = useI18n()
  const campaigns = useCampaigns()
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const shown = (campaigns.data?.results ?? []).filter((c) => (tab === 'open') === (c.status === 'active' || c.status === 'funded'))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold">{t('camp.title')}</h1>
          <p className="m-0 text-sm text-secondary">{t('camp.lead')}</p>
        </div>
        <div role="tablist" aria-label={t('camp.tabs')} className="flex rounded-md bg-subtle p-1">
          {(['open', 'closed'] as const).map((k) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`min-h-10 rounded-[9px] px-4 text-sm ${tab === k ? 'bg-surface font-semibold text-primary' : 'text-secondary'}`}
            >
              {t(`camp.tab.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {campaigns.data && campaigns.data.pool_lyd > 0 ? <Alert tone="success">{t('camp.pool', { n: number(campaigns.data.pool_lyd) })}</Alert> : null}
      {campaigns.isPending ? <Spinner label={t('loading')} /> : null}
      {campaigns.isError ? (
        <div className="flex flex-col items-start gap-3">
          <Alert>{t('error.server')}</Alert>
          <Button variant="secondary" onClick={() => campaigns.refetch()}>
            {t('error.retry')}
          </Button>
        </div>
      ) : null}
      {campaigns.data && shown.length === 0 ? <Card className="text-secondary">{tab === 'open' ? t('camp.emptyOpen') : t('camp.empty')}</Card> : null}

      <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((c) => (
          <li key={c.id}>
            <Card className="flex h-full flex-col gap-2.5">
              <div className="flex items-start justify-between gap-2">
                <Link to="/campaigns/$id" params={{ id: String(c.id) }} className="font-semibold">
                  {pick(locale, c.street_ar, c.street_en) ?? t('queue.noStreet')}
                </Link>
                <span className={`shrink-0 rounded-full px-3 py-0.5 text-[13px] font-semibold ${campaignTone[c.status]}`}>{t(`campaign.${c.status}`)}</span>
              </div>
              <span className="text-sm text-secondary">
                {pick(locale, c.region_name_ar, c.region_name_en)} · <span dir="ltr">#{c.pothole_id}</span>
              </span>
              <span className="font-semibold">{t('camp.raised', { raised: number(c.confirmed_lyd), target: number(c.target_lyd) })}</span>
              <Progress raised={c.confirmed_lyd} target={c.target_lyd} />
              <span className="text-sm text-secondary">
                {t('camp.donors', { n: number(c.donors_count) })}
                {c.under_review_lyd > 0 ? ` · ${t('camp.underReview', { n: number(c.under_review_lyd) })}` : ''}
              </span>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  )
}
