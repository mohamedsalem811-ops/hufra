import { potholeStatusSchema } from '@hufra/contracts';
import { useLocalSearchParams } from 'expo-router';

import { parseFocus } from '@/features/map/geo';
import { MapScreen } from '@/features/map/map-screen';

/** /map, /map?status=fixed (Home "See all"), or /map?focus=<id>&lat=..&lng=.. (a report's "Open on map"). */
export default function MapRoute() {
  const params = useLocalSearchParams<{ focus?: string; lat?: string; lng?: string; status?: string }>();
  const status = potholeStatusSchema.safeParse(params.status);
  return <MapScreen focus={parseFocus(params)} status={status.success ? status.data : null} />;
}
