import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type RouterHistory } from '@tanstack/react-router'
import { useState } from 'react'

import { ApiProvider } from '@/api/api-provider'
import { ApiError, createApiClient, type ApiClient } from '@/api/client'
import { SESSION_KEY } from '@/auth/session'
import { I18nProvider, type Locale } from '@/i18n/i18n'
import { createAdminRouter } from '@/router'

/** Retry only what can fix itself: a dropped connection or a server hiccup. */
export function shouldRetry(failures: number, error: unknown) {
  if (failures >= 2 || !(error instanceof ApiError)) return false
  return error.kind === 'network' || (error.kind === 'http' && (error.status ?? 0) >= 500)
}

export function App({ fetchImpl, history, locale }: { fetchImpl?: typeof fetch; history?: RouterHistory; locale?: Locale }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: shouldRetry, staleTime: 30_000 }, mutations: { retry: false } } }),
  )
  const [api] = useState<ApiClient>(() =>
    // When the session ends (expired, signed out elsewhere) show the sign-in form.
    createApiClient(fetchImpl, () => queryClient.setQueryData(SESSION_KEY, null)),
  )
  const [router] = useState(() => createAdminRouter(history))
  return (
    <I18nProvider initial={locale}>
      <ApiProvider client={api}>
        <QueryClientProvider client={queryClient}>
          <RouterProvider router={router} />
        </QueryClientProvider>
      </ApiProvider>
    </I18nProvider>
  )
}
