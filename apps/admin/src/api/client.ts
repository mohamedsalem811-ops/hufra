import { errorResponseSchema } from '@hufra/contracts'
import type { z } from 'zod'

/**
 * Typed client for the HUFRA API. The admin panel is served from the same
 * origin as the API, so the session lives in HttpOnly cookies
 * (hufra_session, hufra_refresh): no token is ever readable by page scripts.
 * Every answer is checked against the shared schema from @hufra/contracts.
 */
export type ApiErrorKind = 'network' | 'unauthorized' | 'forbidden' | 'http' | 'contract'

export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    /** The server's Arabic message, when it sent one. */
    readonly messageAr?: string,
    readonly retryAfter?: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  schema: S
  signal?: AbortSignal
}

type Fetch = typeof fetch

export interface ApiClient {
  request<S extends z.ZodType>(path: string, options: RequestOptions<S>): Promise<z.infer<S>>
}

export function createApiClient(doFetch: Fetch = (...a) => fetch(...a), onSignedOut: () => void = () => {}): ApiClient {
  let refreshing: Promise<boolean> | null = null

  /** One refresh at a time, shared by every request that hit a 401. */
  function refresh(): Promise<boolean> {
    refreshing ??= doFetch('/api/auth/refresh', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null
      })
    return refreshing
  }

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await doFetch(path, init)
    } catch (cause) {
      if ((cause as Error)?.name === 'AbortError') throw cause
      throw new ApiError('network', 'Network error')
    }
  }

  return {
    async request(path, { method = 'GET', body, schema, signal }) {
      const init: RequestInit = {
        method,
        signal,
        credentials: 'same-origin',
        headers: body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      }
      let res = await send(path, init)
      if (res.status === 401 && !path.startsWith('/api/auth/')) {
        if (await refresh()) res = await send(path, init)
      }

      const text = await res.text()
      let data: unknown = null
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        data = null
      }

      if (!res.ok) {
        const err = errorResponseSchema.safeParse(data)
        const message = err.success ? err.data.error : `HTTP ${res.status}`
        const ar = err.success ? err.data.error_ar : undefined
        if (res.status === 401) {
          if (!path.startsWith('/api/auth/login')) onSignedOut()
          throw new ApiError('unauthorized', message, 401, ar)
        }
        if (res.status === 403) throw new ApiError('forbidden', message, 403, ar)
        const retry = Number(res.headers.get('Retry-After')) || undefined
        throw new ApiError('http', message, res.status, ar, retry)
      }

      const parsed = schema.safeParse(data)
      if (!parsed.success) {
        throw new ApiError('contract', `Unexpected answer from ${path}: ${parsed.error.issues[0]?.message ?? 'shape'}`, res.status)
      }
      return parsed.data
    },
  }
}
