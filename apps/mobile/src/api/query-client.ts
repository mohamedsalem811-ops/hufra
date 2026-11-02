import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './client';

/** Retry only problems that can go away by themselves (connection, timeout, 5xx). */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= 2) return false;
  if (!(error instanceof ApiError)) return false;
  if (error.kind === 'network' || error.kind === 'timeout') return true;
  return error.kind === 'http' && (error.status ?? 0) >= 500;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { staleTime: 30_000, gcTime: 24 * 60 * 60 * 1000, retry: shouldRetry },
      mutations: { retry: false },
    },
  });
}
