import { buildClusterIndex } from './clusters';
import { activeFilterCount, ALL_STATUSES, applyFilters, DEFAULT_FILTERS, onlyStatus, toggle } from './filters';
import { isValidBounds, toBboxParam } from './geo';
import { buildMapStyle } from './map-style';
import { report } from './test-fixtures';

describe('toBboxParam', () => {
  it('pads, rounds outward and orders as minLat,minLng,maxLat,maxLng', () => {
    expect(toBboxParam([13.1, 32.8, 13.3, 32.9], 0)).toBe('32.8,13.1,32.9,13.3');
    expect(toBboxParam([13.1, 32.8, 13.3, 32.9], 0.5)).toBe('32.75,13,32.95,13.4');
  });

  it('gives the same key for nearby viewports (one cached response)', () => {
    expect(toBboxParam([13.101, 32.801, 13.301, 32.901])).toBe(toBboxParam([13.103, 32.803, 13.303, 32.903]));
  });

  it('accepts only four finite numbers as bounds', () => {
    expect(isValidBounds([1, 2, 3, 4])).toBe(true);
    expect(isValidBounds([1, 2, 3])).toBe(false);
    expect(isValidBounds([1, 2, NaN, 4])).toBe(false);
  });
});

describe('filters', () => {
  const reports = [
    report({ id: 1, status: 'reported', severity: 'severe', region_id: 1 }),
    report({ id: 2, status: 'fixed', severity: 'minor', region_id: 2 }),
    report({ id: 3, status: 'under_repair', severity: 'medium', region_id: 1 }),
  ];

  it('shows everything by default', () => {
    expect(applyFilters(reports, DEFAULT_FILTERS)).toHaveLength(3);
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
  });

  it('combines status, severity and area', () => {
    const f = { statuses: ['reported', 'under_repair'] as const, severities: ['severe', 'medium'] as const, regionId: 1 };
    expect(applyFilters(reports, f).map((r) => r.id)).toEqual([1, 3]);
    expect(activeFilterCount(f)).toBe(3);
  });

  it('never lets a toggle empty the list, and keeps the canonical order', () => {
    expect(toggle(['fixed'], 'fixed', ALL_STATUSES)).toEqual(['fixed']);
    expect(toggle(['fixed'], 'reported', ALL_STATUSES)).toEqual(['reported', 'fixed']);
    expect(toggle(['reported', 'fixed'], 'reported', ALL_STATUSES)).toEqual(['fixed']);
  });

  it('status chips select one status or all', () => {
    expect(onlyStatus('verified')).toEqual(['verified']);
    expect(onlyStatus(null)).toEqual(ALL_STATUSES);
  });
});

describe('clusters', () => {
  const tripoli: [number, number, number, number] = [13.0, 32.7, 13.4, 33.0];
  const close = [1, 2, 3].map((id) => report({ id, lng: 13.19 + id * 0.0001, lat: 32.89 }));
  const far = report({ id: 9, lng: 13.35, lat: 32.75 });

  it('groups nearby reports when zoomed out and splits them when zoomed in', () => {
    const index = buildClusterIndex([...close, far]);
    const out = index.itemsIn(tripoli, 10);
    const cluster = out.find((i) => i.kind === 'cluster');
    expect(cluster).toMatchObject({ kind: 'cluster', count: 3 });
    expect(out.find((i) => i.kind === 'report')?.id).toBe(9);
    const zoomed = index.itemsIn(tripoli, 18);
    expect(zoomed.filter((i) => i.kind === 'report')).toHaveLength(4);
  });

  it('a cluster knows the zoom that opens it', () => {
    const cluster = buildClusterIndex(close).itemsIn(tripoli, 8)[0];
    expect(cluster.kind).toBe('cluster');
    if (cluster.kind === 'cluster') expect(cluster.expansionZoom).toBeGreaterThan(8);
  });
});

describe('map style', () => {
  it('uses our tile proxy and dims tiles in dark mode', () => {
    const light = buildMapStyle('light', 'https://api.test');
    expect(light.sources.osm).toMatchObject({ type: 'raster', tiles: ['https://api.test/tiles/{z}/{x}/{y}'] });
    const dark = buildMapStyle('dark', 'https://api.test');
    expect((dark.layers[0] as unknown as { paint: Record<string, number> }).paint['raster-brightness-max']).toBeLessThan(1);
  });
});
