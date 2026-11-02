import { memoryStore } from '@/storage/secure';

import { colorsFor, loadThemeMode, resolveScheme, saveThemeMode } from './theme';

describe('theme', () => {
  it('follows the phone in system mode and obeys an explicit choice', () => {
    expect(resolveScheme('system', 'dark')).toBe('dark');
    expect(resolveScheme('system', null)).toBe('light');
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
  });

  it('uses the brand palettes', () => {
    expect(colorsFor('light').brand.primary).toBe('#0B4A6F');
    expect(colorsFor('dark').bg.canvas).toBe('#0B141B');
  });

  it('remembers the mode and defaults to system', async () => {
    const store = memoryStore();
    await expect(loadThemeMode(store)).resolves.toBe('system');
    await saveThemeMode(store, 'dark');
    await expect(loadThemeMode(store)).resolves.toBe('dark');
  });
});
