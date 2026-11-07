import { createRootRoute, createRoute, createRouter, Outlet, type RouterHistory } from '@tanstack/react-router'

import { isStaff, useSession } from '@/auth/session'
import { Alert, Button, Spinner } from '@/components/ui'
import { useI18n } from '@/i18n/i18n'
import type { MessageKey } from '@/i18n/messages'
import { Shell } from '@/layout/shell'
import { DashboardPage } from '@/routes/dashboard'
import { LoginPage } from '@/routes/login'
import { ComingSoon, NotFound } from '@/routes/placeholders'

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

const root = createRootRoute({ component: Root, notFoundComponent: NotFound })

const soon = (path: string, title: MessageKey) =>
  createRoute({ getParentRoute: () => root, path, component: () => <ComingSoon title={title} /> })

const routeTree = root.addChildren([
  createRoute({ getParentRoute: () => root, path: '/', component: DashboardPage }),
  soon('/reports', 'nav.reports'),
  soon('/map', 'nav.map'),
  soon('/duplicates', 'nav.duplicates'),
  soon('/campaigns', 'nav.campaigns'),
  soon('/donations', 'nav.donations'),
  soon('/regions', 'nav.regions'),
  soon('/people', 'nav.people'),
  soon('/partners', 'nav.partners'),
  soon('/settings', 'nav.settings'),
])

export function createAdminRouter(history?: RouterHistory) {
  return createRouter({ routeTree, basepath: '/admin', history, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAdminRouter>
  }
}
