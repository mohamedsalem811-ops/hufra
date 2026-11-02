import type { PublicPotholeListItem } from '@hufra/contracts';

/** A public report as the list endpoint returns it, for tests. */
export function report(over: Partial<PublicPotholeListItem> & { id: number }): PublicPotholeListItem {
  return {
    region_id: 1,
    lat: 32.89,
    lng: 13.19,
    length_cm: null,
    width_cm: null,
    depth_cm: null,
    severity: 'medium',
    status: 'reported',
    description_ar: null,
    description_en: null,
    street_ar: 'شارع عمر المختار',
    street_en: 'Omar Al-Mukhtar St',
    view_count: 0,
    upvotes_count: 0,
    created_at: '2026-11-01T08:00:00.000Z',
    updated_at: '2026-11-01T08:00:00.000Z',
    verified_at: null,
    under_repair_at: null,
    fixed_at: null,
    deleted_at: null,
    region_name_ar: 'وسط المدينة',
    region_name_en: 'City centre',
    cover_thumb_key: null,
    ...over,
  };
}
