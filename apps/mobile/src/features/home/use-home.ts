import {
  countersResponseSchema,
  publicPotholeListResponseSchema,
  recentFixedResponseSchema,
  topDonorResponseSchema,
  topReporterResponseSchema,
} from '@hufra/contracts';
import { useQuery } from '@tanstack/react-query';
import type { z } from 'zod';

import { useApi } from '@/api/api-provider';

/** Public home data; each block loads (and fails) on its own so one slow call never blanks the screen. */
export function useHomeData() {
  const { api } = useApi();
  const get = <S extends z.ZodType>(path: string, schema: S, signal: AbortSignal) =>
    api.request(path, { schema, auth: false, signal });
  return {
    counters: useQuery({ queryKey: ['home', 'counters'], queryFn: ({ signal }) => get('/api/potholes/counters', countersResponseSchema, signal) }),
    recentFixed: useQuery({
      queryKey: ['home', 'recent-fixed'],
      queryFn: ({ signal }) => get('/api/potholes/recent-fixed', recentFixedResponseSchema, signal),
    }),
    topReporter: useQuery({
      queryKey: ['home', 'top-reporter'],
      queryFn: ({ signal }) => get('/api/potholes/top-reporter', topReporterResponseSchema, signal),
    }),
    topDonor: useQuery({ queryKey: ['home', 'top-donor'], queryFn: ({ signal }) => get('/api/donors/top', topDonorResponseSchema, signal) }),
  };
}

/** Reports within 2 km of the person, when we know where they are. */
export function useNearby(position: { latitude: number; longitude: number } | null) {
  const { api } = useApi();
  // ~100 m rounding: the same street shares one cached answer and the exact position is not sent.
  const lat = position ? Math.round(position.latitude * 1000) / 1000 : null;
  const lng = position ? Math.round(position.longitude * 1000) / 1000 : null;
  return useQuery({
    queryKey: ['home', 'nearby', lat, lng],
    enabled: lat !== null && lng !== null,
    queryFn: ({ signal }) =>
      api.request(`/api/potholes?near_lat=${lat}&near_lng=${lng}&radius_m=2000&limit=50`, {
        schema: publicPotholeListResponseSchema,
        auth: false,
        signal,
      }),
  });
}
