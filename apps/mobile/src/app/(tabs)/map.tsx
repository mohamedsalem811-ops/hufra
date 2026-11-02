import { useLocalSearchParams } from 'expo-router';

import { MapScreen } from '@/features/map/map-screen';
import { parseFocus } from '@/features/map/geo';

/** /map, or /map?focus=<id>&lat=..&lng=.. from a report's "Open on map". */
export default function MapRoute() {
  const params = useLocalSearchParams<{ focus?: string; lat?: string; lng?: string }>();
  return <MapScreen focus={parseFocus(params)} />;
}
