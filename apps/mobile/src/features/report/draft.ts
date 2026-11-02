import type { Severity } from '@hufra/contracts';
import { PHOTO_LIMITS, TEXT_LIMITS } from '@hufra/contracts';

import type { PickedPhoto } from './photo-pick';

export const STEPS = ['location', 'photos', 'details', 'review'] as const;
export type Step = (typeof STEPS)[number];

export interface ReportDraft {
  step: Step;
  location: { latitude: number; longitude: number; accuracy: number | null } | null;
  photos: PickedPhoto[];
  severity: Severity | null;
  street: string;
  description: string;
  widthCm: string;
  depthCm: string;
}

export const emptyDraft: ReportDraft = {
  step: 'location',
  location: null,
  photos: [],
  severity: null,
  street: '',
  description: '',
  widthCm: '',
  depthCm: '',
};

export type DraftAction =
  | { type: 'setLocation'; location: NonNullable<ReportDraft['location']>; street?: string }
  | { type: 'addPhotos'; photos: PickedPhoto[] }
  | { type: 'removePhoto'; index: number }
  | { type: 'set'; field: 'severity' | 'street' | 'description' | 'widthCm' | 'depthCm'; value: string }
  | { type: 'goto'; step: Step }
  | { type: 'next' }
  | { type: 'back' };

/** Can the person move on from this step? */
export function canContinue(d: ReportDraft, step: Step = d.step): boolean {
  switch (step) {
    case 'location':
      return d.location !== null;
    case 'photos':
      return d.photos.length > 0;
    case 'details':
      return d.severity !== null && d.street.length <= TEXT_LIMITS.street && d.description.length <= TEXT_LIMITS.description;
    case 'review':
      return STEPS.slice(0, 3).every((s) => canContinue(d, s));
  }
}

export function draftReducer(d: ReportDraft, a: DraftAction): ReportDraft {
  switch (a.type) {
    case 'setLocation':
      // A street from the map only fills an empty field; never overwrite what the person typed.
      return { ...d, location: a.location, street: d.street || a.street || '' };
    case 'addPhotos':
      return { ...d, photos: [...d.photos, ...a.photos].slice(0, PHOTO_LIMITS.maxPerStage) };
    case 'removePhoto':
      return { ...d, photos: d.photos.filter((_, i) => i !== a.index) };
    case 'set':
      if (a.field === 'severity') return { ...d, severity: a.value as Severity };
      if (a.field === 'widthCm' || a.field === 'depthCm') return { ...d, [a.field]: a.value.replace(/[^\d]/g, '').slice(0, 5) };
      return { ...d, [a.field]: a.value };
    case 'goto':
      return { ...d, step: a.step };
    case 'next': {
      const i = STEPS.indexOf(d.step);
      return canContinue(d) && i < STEPS.length - 1 ? { ...d, step: STEPS[i + 1] } : d;
    }
    case 'back': {
      const i = STEPS.indexOf(d.step);
      return i > 0 ? { ...d, step: STEPS[i - 1] } : d;
    }
  }
}

/** Has the person entered anything worth asking before throwing away? */
export function isDirty(d: ReportDraft): boolean {
  return d.photos.length > 0 || d.severity !== null || d.description.trim() !== '' || d.widthCm !== '' || d.depthCm !== '';
}
