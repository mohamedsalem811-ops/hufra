import type { PublicPotholeListItem } from '@hufra/contracts';
import Supercluster from 'supercluster';

import type { Bounds, LngLat } from './geo';

type ReportProps = { reportId: number };

export type MapItem =
  | { kind: 'cluster'; id: number; lngLat: LngLat; count: number; expansionZoom: number }
  | { kind: 'report'; id: number; lngLat: LngLat; report: PublicPotholeListItem };

export interface ClusterIndex {
  itemsIn(bounds: Bounds, zoom: number): MapItem[];
}

/**
 * Groups nearby reports into one bubble at low zoom (done on the phone: the
 * map tiles are plain images, so there are no map fonts to draw counts with).
 */
export function buildClusterIndex(reports: readonly PublicPotholeListItem[], radius = 56): ClusterIndex {
  const byId = new Map(reports.map((r) => [r.id, r]));
  const index = new Supercluster<ReportProps>({ radius, maxZoom: 16 });
  index.load(
    reports.map((r) => ({
      type: 'Feature' as const,
      properties: { reportId: r.id },
      geometry: { type: 'Point' as const, coordinates: [r.lng, r.lat] },
    })),
  );

  return {
    itemsIn(bounds, zoom) {
      const items: MapItem[] = [];
      for (const f of index.getClusters(bounds, Math.round(zoom))) {
        const [lng, lat] = f.geometry.coordinates as LngLat;
        if ('cluster' in f.properties && f.properties.cluster) {
          const id = f.properties.cluster_id;
          items.push({
            kind: 'cluster',
            id,
            lngLat: [lng, lat],
            count: f.properties.point_count,
            expansionZoom: Math.min(index.getClusterExpansionZoom(id), 18),
          });
        } else {
          const report = byId.get((f.properties as ReportProps).reportId);
          if (report) items.push({ kind: 'report', id: report.id, lngLat: [lng, lat], report });
        }
      }
      return items;
    },
  };
}
