import { publicPotholeListResponseSchema, regionListResponseSchema } from '@hufra/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { useApi } from '@/api/api-provider';

/** Reports inside a bbox ("minLat,minLng,maxLat,maxLng"). Public call: never sends the session. */
export function useMapReports(bbox: string | null) {
  const { api } = useApi();
  return useQuery({
    queryKey: ['map-reports', bbox],
    enabled: bbox !== null,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      api.request(`/api/potholes?bbox=${encodeURIComponent(bbox ?? '')}&limit=500`, {
        schema: publicPotholeListResponseSchema,
        auth: false,
        signal,
      }),
    select: (data) => data.results,
  });
}

/** Active areas for the filter sheet. Changes rarely, so it stays fresh for an hour. */
export function useRegions() {
  const { api } = useApi();
  return useQuery({
    queryKey: ['regions'],
    staleTime: 60 * 60 * 1000,
    queryFn: ({ signal }) => api.request('/api/regions', { schema: regionListResponseSchema, auth: false, signal }),
    select: (data) => data.results.filter((r) => r.active === 1),
  });
}
