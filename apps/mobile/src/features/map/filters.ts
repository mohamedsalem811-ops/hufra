import type { PotholeStatus, PublicPotholeListItem, Severity } from '@hufra/contracts';

export const ALL_STATUSES: readonly PotholeStatus[] = ['reported', 'verified', 'under_repair', 'fixed'];
export const ALL_SEVERITIES: readonly Severity[] = ['minor', 'medium', 'severe'];

export interface MapFilters {
  statuses: readonly PotholeStatus[];
  severities: readonly Severity[];
  regionId: number | null;
}

export const DEFAULT_FILTERS: MapFilters = { statuses: ALL_STATUSES, severities: ALL_SEVERITIES, regionId: null };

/** How many filters differ from "show everything" (the badge on the filter button). */
export function activeFilterCount(f: MapFilters): number {
  return (
    Number(f.statuses.length !== ALL_STATUSES.length) +
    Number(f.severities.length !== ALL_SEVERITIES.length) +
    Number(f.regionId !== null)
  );
}

export function applyFilters(reports: readonly PublicPotholeListItem[], f: MapFilters): PublicPotholeListItem[] {
  return reports.filter(
    (r) =>
      f.statuses.includes(r.status) &&
      f.severities.includes(r.severity) &&
      (f.regionId === null || r.region_id === f.regionId),
  );
}

/** Adds or removes one value, never leaving the list empty (an empty filter would hide everything). */
export function toggle<T>(list: readonly T[], value: T, all: readonly T[]): readonly T[] {
  if (!list.includes(value)) return all.filter((v) => v === value || list.includes(v));
  const next = list.filter((v) => v !== value);
  return next.length === 0 ? list : next;
}

/** Status chip row: "All", or exactly one status. */
export function onlyStatus(status: PotholeStatus | null): readonly PotholeStatus[] {
  return status === null ? ALL_STATUSES : [status];
}
