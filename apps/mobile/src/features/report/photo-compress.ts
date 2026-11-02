import { PHOTO_LIMITS } from '@hufra/contracts';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

export interface PreparedImage {
  uri: string;
  width: number;
  height: number;
  bytes: number;
}

export interface PreparedPhoto {
  full: PreparedImage;
  thumb: PreparedImage;
}

/** Target size that keeps the aspect ratio and never enlarges. */
export function fitLongEdge(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxEdge || longest === 0) return { width, height };
  const scale = maxEdge / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** JPEG qualities to try, best first, until the file fits the byte limit. */
export const QUALITY_STEPS = [0.72, 0.6, 0.5, 0.4, 0.3] as const;

export interface Encoder {
  /** Resize to the given size and save as a fresh JPEG (no EXIF: the file is re-encoded). */
  encode(uri: string, size: { width: number; height: number }, quality: number): Promise<{ uri: string; width: number; height: number }>;
  sizeOf(uri: string): number;
  /** Pixel size of an image whose size the picker did not report. */
  measure(uri: string): Promise<{ width: number; height: number }>;
}

export const nativeEncoder: Encoder = {
  async encode(uri, size, quality) {
    const rendered = await ImageManipulator.manipulate(uri).resize(size).renderAsync();
    const saved = await rendered.saveAsync({ compress: quality, format: SaveFormat.JPEG });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  },
  sizeOf(uri) {
    return new File(uri).size ?? 0;
  },
  async measure(uri) {
    const image = await ImageManipulator.manipulate(uri).renderAsync();
    return { width: image.width, height: image.height };
  },
};

async function encodeWithin(
  encoder: Encoder,
  source: { uri: string; width: number; height: number },
  limit: { maxBytes: number; maxLongEdgePx: number },
): Promise<PreparedImage> {
  const size = fitLongEdge(source.width, source.height, limit.maxLongEdgePx);
  let last: PreparedImage | null = null;
  for (const quality of QUALITY_STEPS) {
    const out = await encoder.encode(source.uri, size, quality);
    last = { ...out, bytes: encoder.sizeOf(out.uri) };
    if (last.bytes <= limit.maxBytes) return last;
  }
  throw new Error(`Photo still ${last?.bytes} bytes after compression (limit ${limit.maxBytes})`);
}

/**
 * Makes the two files the server accepts (packages/contracts PHOTO_LIMITS):
 * a full photo (≤1280 px, ≤400 KB) and a thumbnail (≤320 px, ≤64 KB), both
 * re-encoded on the phone so camera metadata (GPS, device) never leaves it.
 */
export async function preparePhoto(
  source: { uri: string; width: number; height: number },
  encoder: Encoder = nativeEncoder,
): Promise<PreparedPhoto> {
  // Some pickers (e.g. Android's photo picker) can return 0 x 0: measure the real size first.
  const known = source.width > 0 && source.height > 0 ? source : { uri: source.uri, ...(await encoder.measure(source.uri)) };
  const full = await encodeWithin(encoder, known, PHOTO_LIMITS.full);
  const thumb = await encodeWithin(encoder, full, PHOTO_LIMITS.thumb);
  return { full, thumb };
}
