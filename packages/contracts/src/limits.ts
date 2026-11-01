// Limits shared by the server (which enforces them) and the apps (which must
// respect them before sending, e.g. when compressing photos on the phone).

export const PHOTO_LIMITS = {
  /** Photos of one stage per report ("report", "before", "during", "after"). */
  maxPerStage: 3,
  /** Formats accepted (checked from the file bytes on the server). */
  types: ['image/webp', 'image/jpeg'] as const,
  full: { maxBytes: 400 * 1024, maxLongEdgePx: 1280 },
  thumb: { maxBytes: 64 * 1024, maxLongEdgePx: 320 },
  /** Photos must not carry EXIF (GPS, device) metadata: re-encode before upload. */
  exifAllowed: false,
} as const

export const PASSWORD_LIMITS = { minLength: 8, maxLength: 128 } as const

export const TEXT_LIMITS = {
  description: 1000,
  street: 200,
  contact: 120,
  statusNote: 500,
  displayName: 80,
  /** A report moved back to an earlier status needs a reason at least this long. */
  reopenNoteMin: 5,
} as const

/** "Near me" search radius bounds, metres. */
export const RADIUS_LIMITS = { min: 50, max: 50000, default: 2000 } as const
