import { createRootRoute, createRoute, createRouter, Outlet, type RouterHistory } from '@tanstack/react-router'

import { isStaff, useSession } from '@/auth/session'
import { Alert, Button, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import { Shell } from '@/layout/shell'
import { DashboardPage } from '@/routes/dashboard'
import { NotificationsPage } from '@/routes/notifications'
import { LoginPage } from '@/routes/login'
import { CampaignPage } from '@/campaigns/campaign-page'
import { CampaignsPage } from '@/campaigns/campaigns-page'
import { NewCampaignPage } from '@/campaigns/new-campaign-page'
import { ReviewPage } from '@/donations/review-page'
import { REVIEW_TABS } from '@/donations/use-donations'
import { DuplicatesPage } from '@/reports/duplicates-page'
import { QueuePage } from '@/reports/queue-page'
import { MapPage } from '@/map/map-page'
import { ReportPage } from '@/reports/report-page'
import type { QueueFilters } from '@/reports/use-reports'
import { PartnersPage } from '@/partners/partners-page'
import { PeoplePage, RegionsPage } from '@/people/people-page'
import { NotFound } from '@/routes/placeholders'
import { SettingsPage } from '@/settings/settings-page'

/** Every page needs a staff session; without one the sign-in form shows in place. */
function Root() {
  const { t } = useI18n()
  const session = useSession()
  if (session.isPending) return <Spinner label={t('loading')} />
  if (session.isError) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-start gap-3 p-8">
        <Alert>{t('error.server')}</Alert>
        <Button variant="secondary" onClick={() => session.refetch()}>
          {t('error.retry')}
        </Button>
      </div>
    )
  }
  if (!session.data || !isStaff(session.data)) return <LoginPage />
  return (
    <Shell user={session.data}>
      <Outlet />
    </Shell>
  )
}

const oneOf = <T extends string>(v: unknown, options: readonly T[]): T | undefined => (options.includes(v as T) ? (v as T) : undefined)
const positive = (v: unknown) => {
  const n = Number(v)
  return Number.isInteger(n) && n > 0 ? n : undefined
}

/** The queue's filters live in the address, so a filtered list can be shared or reloaded. */
export function parseQueueSearch(s: Record<string, unknown>): QueueFilters {
  const q = typeof s.q === 'string' && s.q.trim() ? s.q.trim().slice(0, 100) : typeof s.q === 'number' ? String(s.q) : undefined
  const page = positive(s.page)
  return {
    q,
    status: oneOf(s.status, ['reported', 'verified', 'under_repair', 'fixed'] as const),
    severity: oneOf(s.severity, ['minor', 'medium', 'severe'] as const),
    region_id: positive(s.region_id),
    duplicates: s.duplicates === '1' || s.duplicates === 1 ? '1' : undefined,
    sort: oneOf(s.sort, ['oldest', 'most_confirmed'] as const),
    page: page && page > 1 ? page : undefined,
  }
}

const root = createRootRoute({ component: Root, notFoundComponent: NotFound })

const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: DashboardPage }),
  createRoute({ getParentRoute: () => root, path: '/notifications', component: NotificationsPage }),
  createRoute({ getParentRoute: () => root, path: '/reports', component: QueuePage, validateSearch: parseQueueSearch }),
  createRoute({ getParentRoute: () => root, path: '/reports/$id', component: ReportPage }),
  createRoute({ getParentRoute: () => root, path: '/map', component: MapPage }),
  createRoute({ getParentRoute: () => root, path: '/duplicates', component: DuplicatesPage }),
  createRoute({ getParentRoute: () => root, path: '/campaigns', component: CampaignsPage }),
  createRoute({ getParentRoute: () => root, path: '/campaigns/new', component: NewCampaignPage, validateSearch: (s: Record<string, unknown>) => ({ report: positive(s.report) }) }),
  createRoute({ getParentRoute: () => root, path: '/campaigns/$id', component: CampaignPage }),
  createRoute({
    getParentRoute: () => root,
    path: '/donations',
    component: ReviewPage,
    validateSearch: (s: Record<string, unknown>) => ({ tab: oneOf(s.tab, REVIEW_TABS.filter((k) => k !== 'under_review')), id: positive(s.id) }),
  }),
  createRoute({ getParentRoute: () => root, path: '/regions', component: RegionsPage }),
  createRoute({ getParentRoute: () => root, path: '/people', component: PeoplePage }),
  createRoute({
    getParentRoute: () => root,
    path: '/partners',
    component: PartnersPage,
    validateSearch: (s: Record<string, unknown>): { id?: number | 'new' } => ({ id: s.id === 'new' ? 'new' : positive(s.id) }),
  }),
  createRoute({ getParentRoute: () => root, path: '/settings', component: SettingsPage }),
])

export function createAdminRouter(history?: RouterHistory) {
  return createRouter({ routeTree, basepath: '/admin', history, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>
  }
}
