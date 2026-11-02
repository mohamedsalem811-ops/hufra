import { z } from 'zod';

import { ApiError, type ApiClient } from '@/api/client';

import { canContinue, draftReducer, emptyDraft, isDirty, type ReportDraft } from './draft';
import { fitLongEdge, preparePhoto, type Encoder } from './photo-compress';
import { submitReport, SubmitError, toCreateInput } from './submit';

const photo = (n: number) => ({ uri: `file:///p${n}.jpg`, width: 4000, height: 3000 });
const ready: ReportDraft = {
  ...emptyDraft,
  step: 'review',
  location: { latitude: 32.89, longitude: 13.19, accuracy: 8 },
  photos: [photo(1), photo(2)],
  severity: 'severe',
  street: ' شارع الجمهورية ',
  description: 'أمام المدرسة',
  widthCm: '40',
  depthCm: '',
};

describe('draft', () => {
  it('only moves on when the current step is complete', () => {
    let d = draftReducer(emptyDraft, { type: 'next' });
    expect(d.step).toBe('location');
    d = draftReducer(d, { type: 'setLocation', location: { latitude: 1, longitude: 2, accuracy: null }, street: 'X' });
    d = draftReducer(d, { type: 'next' });
    expect(d.step).toBe('photos');
    expect(canContinue(d)).toBe(false);
    d = draftReducer(d, { type: 'addPhotos', photos: [photo(1)] });
    expect(canContinue(d)).toBe(true);
  });

  it('keeps at most three photos and never overwrites a typed street with the map suggestion', () => {
    let d = draftReducer(emptyDraft, { type: 'addPhotos', photos: [photo(1), photo(2), photo(3), photo(4)] });
    expect(d.photos).toHaveLength(3);
    d = draftReducer(d, { type: 'set', field: 'street', value: 'my street' });
    d = draftReducer(d, { type: 'setLocation', location: { latitude: 1, longitude: 2, accuracy: null }, street: 'geocoded' });
    expect(d.street).toBe('my street');
  });

  it('keeps measurements to digits and knows when there is work to lose', () => {
    const d = draftReducer(emptyDraft, { type: 'set', field: 'widthCm', value: '4o0 cm' });
    expect(d.widthCm).toBe('40');
    expect(isDirty(emptyDraft)).toBe(false);
    expect(isDirty(d)).toBe(true);
  });

  it('builds the API body in the language the text was written in', () => {
    expect(toCreateInput(ready, 'ar', 'uuid-12345678')).toEqual({
      lat: 32.89,
      lng: 13.19,
      severity: 'severe',
      street_ar: 'شارع الجمهورية',
      description_ar: 'أمام المدرسة',
      width_cm: 40,
      client_report_uuid: 'uuid-12345678',
    });
    expect(toCreateInput(ready, 'en', 'uuid-12345678')).toMatchObject({ street_en: 'شارع الجمهورية' });
  });
});

describe('photo compression', () => {
  it('fits the long edge without enlarging', () => {
    expect(fitLongEdge(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitLongEdge(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitLongEdge(800, 600, 1280)).toEqual({ width: 800, height: 600 });
  });

  it('lowers the quality until each file fits the server limits', async () => {
    const calls: { size: { width: number; height: number }; quality: number }[] = [];
    const encoder: Encoder = {
      encode: async (uri, size, quality) => {
        calls.push({ size, quality });
        return { uri: `${uri}#${size.width}@${quality}`, ...size };
      },
      // Full photos fit at quality 0.5; thumbnails fit first time.
      sizeOf: (uri) => {
        const [, width, quality] = /#(\d+)@([\d.]+)$/.exec(uri) ?? [];
        if (width === '1280') return quality === '0.5' ? 300_000 : 500_000;
        return 40_000;
      },
      measure: async () => ({ width: 4000, height: 3000 }),
    };
    const out = await preparePhoto(photo(1), encoder);
    expect(out.full).toMatchObject({ width: 1280, height: 960, bytes: 300_000 });
    expect(out.thumb).toMatchObject({ width: 320, height: 240, bytes: 40_000 });
    expect(calls.map((c) => c.quality)).toEqual([0.72, 0.6, 0.5, 0.72]);
  });

  it('gives up rather than sending an oversized photo', async () => {
    const encoder: Encoder = { encode: async (uri, size) => ({ uri, ...size }), sizeOf: () => 9_000_000, measure: async () => ({ width: 1, height: 1 }) };
    await expect(preparePhoto(photo(1), encoder)).rejects.toThrow(/after compression/);
  });

  it('measures a photo the picker reported as 0 x 0 before resizing it', async () => {
    const sizes: { width: number; height: number }[] = [];
    const encoder: Encoder = {
      encode: async (uri, size) => {
        sizes.push(size);
        return { uri, ...size };
      },
      sizeOf: () => 1000,
      measure: async () => ({ width: 3000, height: 4000 }),
    };
    await preparePhoto({ uri: 'content://picked', width: 0, height: 0 }, encoder);
    expect(sizes[0]).toEqual({ width: 960, height: 1280 });
  });
});

describe('submitReport', () => {
  const prepared = { full: { uri: 'f', width: 1, height: 1, bytes: 1 }, thumb: { uri: 't', width: 1, height: 1, bytes: 1 } };

  function fakeApi(handler: (path: string) => unknown) {
    const calls: string[] = [];
    const api: ApiClient = {
      request: async <S extends z.ZodType>(path: string, opts: { schema: S }) => {
        calls.push(path);
        return opts.schema.parse(handler(path));
      },
    };
    return { api, calls };
  }

  it('creates the report once, then uploads each photo with the permit', async () => {
    const { api, calls } = fakeApi((p) =>
      p === '/api/potholes' ? { id: 42, status: 'reported', upload_token: 'tok' } : { id: 1, r2_key: 'k', thumb_key: 't', stage: 'report' },
    );
    const progress = jest.fn();
    const res = await submitReport(toCreateInput(ready, 'ar', 'u-12345678'), ready.photos, {
      api,
      prepare: async () => prepared,
      onProgress: progress,
    });
    expect(res).toEqual({ reportId: 42 });
    expect(calls).toEqual(['/api/potholes', '/api/photos/42', '/api/photos/42']);
    expect(progress).toHaveBeenCalledWith({ phase: 'uploading', done: 1, total: 2 });
  });

  it('on a failed photo, a retry continues from that photo without creating the report again', async () => {
    let failSecond = true;
    const { api, calls } = fakeApi((p) => {
      if (p === '/api/potholes') return { id: 42, status: 'reported', upload_token: 'tok' };
      if (failSecond && calls.filter((c) => c.startsWith('/api/photos')).length === 2) {
        failSecond = false;
        throw new ApiError('network', 'offline');
      }
      return { id: 1, r2_key: 'k', thumb_key: 't', stage: 'report' };
    });
    const input = toCreateInput(ready, 'ar', 'u-12345678');
    const err = await submitReport(input, ready.photos, { api, prepare: async () => prepared }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(SubmitError);
    expect((err as SubmitError).reportCreated).toBe(true);
    expect((err as SubmitError).state).toEqual({ reportId: 42, uploadToken: 'tok', uploaded: 1 });

    calls.length = 0;
    await expect(submitReport(input, ready.photos, { api, prepare: async () => prepared }, (err as SubmitError).state)).resolves.toEqual({
      reportId: 42,
    });
    expect(calls).toEqual(['/api/photos/42']);
  });
});
