import { createPotholeResponseSchema, photoUploadResponseSchema, type CreatePotholeInput } from '@hufra/contracts';
import { File } from 'expo-file-system';

import type { ApiClient } from '@/api/client';
import type { Locale } from '@/i18n/locale';

import type { ReportDraft } from './draft';
import type { PreparedPhoto } from './photo-compress';
import type { PickedPhoto } from './photo-pick';

/** Body for POST /api/potholes. Text goes in the field of the language it was written in. */
export function toCreateInput(d: ReportDraft, locale: Locale, clientUuid: string): CreatePotholeInput {
  if (!d.location || !d.severity) throw new Error('Draft is incomplete');
  const street = d.street.trim();
  const description = d.description.trim();
  const width = d.widthCm ? Number(d.widthCm) : undefined;
  const depth = d.depthCm ? Number(d.depthCm) : undefined;
  return {
    lat: d.location.latitude,
    lng: d.location.longitude,
    severity: d.severity,
    ...(locale === 'ar' ? { street_ar: street, description_ar: description } : { street_en: street, description_en: description }),
    ...(width ? { width_cm: width } : {}),
    ...(depth ? { depth_cm: depth } : {}),
    client_report_uuid: clientUuid,
  };
}

/** A compressed photo on the phone, as a multipart file part (JPEG, read by Expo's fetch). */
export function photoPart(uri: string): Blob {
  return new File(uri) as unknown as Blob;
}

export type SubmitProgress = { phase: 'creating' } | { phase: 'uploading'; done: number; total: number };

export interface SubmitDeps {
  api: ApiClient;
  prepare: (photo: PickedPhoto) => Promise<PreparedPhoto>;
  onProgress?: (p: SubmitProgress) => void;
}

/** Where a submission stands, so a retry continues instead of starting over. */
export interface SubmitState {
  reportId: number | null;
  uploadToken: string | null;
  uploaded: number;
}

export const initialSubmitState: SubmitState = { reportId: null, uploadToken: null, uploaded: 0 };

/**
 * 1. Create the report (once: the device uuid makes a re-send return the same
 *    report and a fresh upload permit). 2. Compress and upload each photo with
 *    that permit. Throws on failure with `state` showing how far it got.
 */
export async function submitReport(
  input: CreatePotholeInput,
  photos: readonly PickedPhoto[],
  deps: SubmitDeps,
  from: SubmitState = initialSubmitState,
): Promise<{ reportId: number }> {
  const state = { ...from };
  try {
    if (state.reportId === null || state.uploadToken === null) {
      deps.onProgress?.({ phase: 'creating' });
      const created = await deps.api.request('/api/potholes', { method: 'POST', body: input, schema: createPotholeResponseSchema });
      state.reportId = created.id;
      state.uploadToken = created.upload_token;
    }
    for (let i = state.uploaded; i < photos.length; i++) {
      deps.onProgress?.({ phase: 'uploading', done: i, total: photos.length });
      const prepared = await deps.prepare(photos[i]);
      const form = new FormData();
      form.append('stage', 'report');
      form.append('upload_token', state.uploadToken);
      // Expo's fetch only sends file parts it can read the bytes of (a Blob or an
      // expo-file-system File); the old React Native { uri, name, type } object is
      // rejected with "Unsupported FormDataPart implementation".
      form.append('full', photoPart(prepared.full.uri));
      form.append('thumb', photoPart(prepared.thumb.uri));
      await deps.api.request(`/api/photos/${state.reportId}`, { method: 'POST', body: form, schema: photoUploadResponseSchema });
      state.uploaded = i + 1;
    }
    return { reportId: state.reportId };
  } catch (error) {
    throw new SubmitError(error, state);
  }
}

export class SubmitError extends Error {
  constructor(
    readonly cause: unknown,
    readonly state: SubmitState,
  ) {
    super('Report submission failed');
    this.name = 'SubmitError';
  }
  /** The report exists on the server; only photos are missing. */
  get reportCreated(): boolean {
    return this.state.reportId !== null;
  }
}
