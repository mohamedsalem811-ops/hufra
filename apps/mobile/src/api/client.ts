import { errorResponseSchema, refreshResponseSchema } from '@hufra/contracts';
import type { z } from 'zod';

import type { TokenStore } from './token-store';

export type ApiErrorKind = 'network' | 'timeout' | 'http' | 'unauthorized' | 'invalid_response';

/** One error type for every failed call, so screens can show the right message. */
export class ApiError extends Error {
  constructor(
    readonly kind: ApiErrorKind,
    message: string,
    readonly status?: number,
    /** Server-provided wording, when the API sent { error, error_ar }. */
    readonly serverMessage?: { en?: string; ar?: string },
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface RequestOptions<S extends z.ZodType> {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Response schema from @hufra/contracts; the response is rejected if it does not match. */
  schema: S;
  /** Send the access token and refresh it on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

export interface ApiClientOptions {
  baseUrl: string;
  tokens: TokenStore;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
  /** Called once when the session can no longer be refreshed (tokens already cleared). */
  onSignedOut?: () => void;
}

export interface ApiClient {
  request<S extends z.ZodType>(path: string, options: RequestOptions<S>): Promise<z.infer<S>>;
}

export function createApiClient({
  baseUrl,
  tokens,
  fetchFn = fetch,
  timeoutMs = 20_000,
  onSignedOut,
}: ApiClientOptions): ApiClient {
  // One refresh at a time: the server rotates refresh tokens and treats a
  // reused one as theft, so parallel 401s must share a single refresh call.
  let refreshing: Promise<boolean> | null = null;

  async function send(path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const onAbort = () => controller.abort();
    signal?.addEventListener('abort', onAbort);
    try {
      return await fetchFn(`${baseUrl}${path}`, { ...init, signal: controller.signal });
    } catch (err) {
      if (controller.signal.aborted && !signal?.aborted) throw new ApiError('timeout', 'Request timed out');
      throw new ApiError('network', err instanceof Error ? err.message : 'Network request failed');
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  async function doRefresh(): Promise<boolean> {
    const current = await tokens.get();
    if (!current) return false;
    let res: Response;
    try {
      res = await send('/api/auth/refresh', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: current.refreshToken }),
      });
    } catch {
      // Offline: keep the session; the next call can try again.
      throw new ApiError('network', 'Could not refresh the session (offline)');
    }
    if (!res.ok) return false;
    const parsed = refreshResponseSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success || !('access_token' in parsed.data)) return false;
    await tokens.set({ accessToken: parsed.data.access_token, refreshToken: parsed.data.refresh_token });
    return true;
  }

  function refreshOnce(): Promise<boolean> {
    refreshing ??= doRefresh().finally(() => {
      refreshing = null;
    });
    return refreshing;
  }

  async function signOut(): Promise<never> {
    await tokens.clear();
    onSignedOut?.();
    throw new ApiError('unauthorized', 'Session expired', 401);
  }

  async function request<S extends z.ZodType>(path: string, options: RequestOptions<S>): Promise<z.infer<S>> {
    const { method = 'GET', body, schema, auth = true, signal } = options;

    const attempt = async (): Promise<Response> => {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (auth) {
        const session = await tokens.get();
        if (session) headers.Authorization = `Bearer ${session.accessToken}`;
      }
      return send(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, signal);
    };

    let res = await attempt();
    if (res.status === 401 && auth && (await tokens.get())) {
      if (!(await refreshOnce())) return signOut();
      res = await attempt();
      if (res.status === 401) return signOut();
    }

    const json: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const err = errorResponseSchema.safeParse(json);
      const serverMessage = err.success ? { en: err.data.error, ar: err.data.error_ar } : undefined;
      throw new ApiError(res.status === 401 ? 'unauthorized' : 'http', `HTTP ${res.status}`, res.status, serverMessage);
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiError('invalid_response', `Unexpected response from ${method} ${path}`, res.status);
    }
    return parsed.data;
  }

  return { request };
}
