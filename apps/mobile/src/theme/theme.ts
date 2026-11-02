import { themes, type ColorTheme } from '@hufra/brand';

import type { KeyValueStore } from '@/storage/secure';

/** "system" follows the phone; light/dark are the person's choice in Settings. */
export type ThemeMode = 'system' | 'light' | 'dark';
export type ColorScheme = 'light' | 'dark';

const MODE_KEY = 'hufra.themeMode';

export function resolveScheme(mode: ThemeMode, system: ColorScheme | null | undefined): ColorScheme {
  if (mode !== 'system') return mode;
  return system === 'dark' ? 'dark' : 'light';
}

export function colorsFor(scheme: ColorScheme): ColorTheme {
  return themes[scheme];
}

export async function loadThemeMode(store: KeyValueStore): Promise<ThemeMode> {
  const saved = await store.get(MODE_KEY).catch(() => null);
  return saved === 'light' || saved === 'dark' || saved === 'system' ? saved : 'system';
}

export function saveThemeMode(store: KeyValueStore, mode: ThemeMode): Promise<void> {
  return store.set(MODE_KEY, mode);
}
