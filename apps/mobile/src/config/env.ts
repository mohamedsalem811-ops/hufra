/**
 * Where the app talks to. Set EXPO_PUBLIC_API_URL at build time to point a
 * build at another server (e.g. a local `wrangler dev`); otherwise the live
 * Worker is used. Read once at start-up: Expo inlines EXPO_PUBLIC_* values.
 */
export const DEFAULT_API_URL = 'https://hufra.mohamedsalem811.workers.dev';

export function resolveApiUrl(value: string | undefined = process.env.EXPO_PUBLIC_API_URL): string {
  const raw = (value ?? '').trim();
  if (!raw) return DEFAULT_API_URL;
  if (!/^https?:\/\/[^\s/]+/i.test(raw)) {
    throw new Error(`EXPO_PUBLIC_API_URL must be an http(s) URL, got "${raw}"`);
  }
  return raw.replace(/\/+$/, '');
}

export const API_URL = resolveApiUrl();
