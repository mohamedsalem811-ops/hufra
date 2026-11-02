import type { Photo, PotholeDetailResponse } from '@hufra/contracts';

import { parseFocus } from '../map/geo';
import { beforeAfterPair, daysBetween, daysText, directionsUrls, galleryPhotos, shareUrl, timeline } from './model';

const photo = (id: number, stage: Photo['stage']): Photo => ({
  id,
  stage,
  r2_key: `p/${id}.webp`,
  thumb_key: `p/${id}-t.webp`,
  created_at: `2026-11-0${id}T08:00:00.000Z`,
});

describe('photos', () => {
  it('gallery keeps everything except "after" photos', () => {
    const photos = [photo(1, 'report'), photo(2, 'before'), photo(3, 'during'), photo(4, 'after')];
    expect(galleryPhotos(photos).map((p) => p.id)).toEqual([1, 2, 3]);
  });

  it('before/after prefers the team "before" photo and the latest "after"', () => {
    const pair = beforeAfterPair([photo(1, 'report'), photo(2, 'before'), photo(3, 'after'), photo(4, 'after')]);
    expect(pair?.before.id).toBe(2);
    expect(pair?.after.id).toBe(4);
  });

  it('falls back to the report photo, and needs an "after" photo', () => {
    expect(beforeAfterPair([photo(1, 'report'), photo(3, 'after')])?.before.id).toBe(1);
    expect(beforeAfterPair([photo(1, 'report'), photo(2, 'before')])).toBeNull();
    expect(beforeAfterPair([photo(3, 'after')])).toBeNull();
  });
});

const pothole = {
  created_at: '2026-11-01T08:00:00.000Z',
  verified_at: '2026-11-03T08:00:00.000Z',
  under_repair_at: null,
  fixed_at: '2026-11-05T09:00:00.000Z',
} as PotholeDetailResponse['pothole'];

describe('timeline', () => {
  it('lists recorded changes newest first, with trimmed team notes', () => {
    const entries = timeline({
      pothole,
      history: [
        { from_status: null, to_status: 'reported', note: null, at: '2026-11-01T08:00:00.000Z' },
        { from_status: 'reported', to_status: 'verified', note: '  ', at: '2026-11-03T08:00:00.000Z' },
        { from_status: 'verified', to_status: 'fixed', note: ' Asphalt patched ', at: '2026-11-05T09:00:00.000Z' },
      ],
    });
    expect(entries.map((e) => e.status)).toEqual(['fixed', 'verified', 'reported']);
    expect(entries[0].note).toBe('Asphalt patched');
    expect(entries[1].note).toBeNull();
  });

  it('uses the report dates when there is no history', () => {
    expect(timeline({ pothole, history: [] }).map((e) => e.status)).toEqual(['fixed', 'verified', 'reported']);
  });
});

describe('days', () => {
  it('counts whole days and never goes negative', () => {
    expect(daysBetween('2026-11-01T08:00:00Z', '2026-11-05T07:00:00Z')).toBe(3);
    expect(daysBetween('2026-11-05T08:00:00Z', '2026-11-01T08:00:00Z')).toBe(0);
    expect(daysBetween('nope', '2026-11-01T08:00:00Z')).toBe(0);
  });

  it('uses the right Arabic form for each count', () => {
    expect([1, 2, 3, 10, 11, 25].map((n) => daysText(n, 'ar'))).toEqual([
      'يوم واحد',
      'يومين',
      '3 أيام',
      '10 أيام',
      '11 يوماً',
      '25 يوماً',
    ]);
    expect([1, 4].map((n) => daysText(n, 'en'))).toEqual(['1 day', '4 days']);
  });
});

describe('links', () => {
  it('shares the public report page', () => {
    expect(shareUrl(42)).toMatch(/^https:\/\/.+\/pothole\/42$/);
  });

  it('builds directions for each maps app', () => {
    const urls = directionsUrls(32.8872, 13.1913, 'شارع الجمهورية');
    expect(urls.android).toBe(`geo:32.887200,13.191300?q=32.887200,13.191300(${encodeURIComponent('شارع الجمهورية')})`);
    expect(urls.apple).toBe('maps://?daddr=32.887200,13.191300&dirflg=d');
    expect(urls.google).toBe('https://www.google.com/maps/dir/?api=1&destination=32.887200,13.191300');
  });
});

describe('parseFocus', () => {
  it('accepts a report inside Libya and rejects anything else', () => {
    expect(parseFocus({ focus: '7', lat: '32.88', lng: '13.19' })).toEqual({ id: 7, lngLat: [13.19, 32.88] });
    expect(parseFocus({})).toBeNull();
    expect(parseFocus({ focus: 'x', lat: '32.88', lng: '13.19' })).toBeNull();
    expect(parseFocus({ focus: '7', lat: '48.85', lng: '2.35' })).toBeNull();
  });
});
