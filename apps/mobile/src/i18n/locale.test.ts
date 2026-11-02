import { memoryStore } from '@/storage/secure';

import { applyLayoutDirection, loadLocale, saveLocale, type DirectionManager } from './locale';
import { ar, en } from './messages';

function fakeManager(isRTL: boolean): DirectionManager & { forced: boolean[] } {
  const forced: boolean[] = [];
  return { isRTL, forced, allowRTL: jest.fn(), forceRTL: (v: boolean) => forced.push(v) };
}

describe('messages', () => {
  it('has the same keys and no empty text in Arabic and English', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(ar).sort());
    for (const value of [...Object.values(ar), ...Object.values(en)]) expect(value.trim()).not.toBe('');
  });
});

describe('locale', () => {
  it('defaults to Arabic and remembers a choice', async () => {
    const store = memoryStore();
    await expect(loadLocale(store)).resolves.toBe('ar');
    await saveLocale(store, 'en');
    await expect(loadLocale(store)).resolves.toBe('en');
  });

  it('ignores a corrupted saved value', async () => {
    await expect(loadLocale(memoryStore({ 'hufra.locale': 'fr' }))).resolves.toBe('ar');
  });
});

describe('applyLayoutDirection', () => {
  it('forces right-to-left and reloads once when Arabic starts on a left-to-right phone', async () => {
    const manager = fakeManager(false);
    const reload = jest.fn(async () => {});
    await expect(applyLayoutDirection('ar', manager, reload)).resolves.toBe(true);
    expect(manager.forced).toEqual([true]);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the direction already matches', async () => {
    const manager = fakeManager(true);
    const reload = jest.fn(async () => {});
    await expect(applyLayoutDirection('ar', manager, reload)).resolves.toBe(false);
    expect(manager.forced).toEqual([]);
    expect(reload).not.toHaveBeenCalled();
  });

  it('switches back to left-to-right for English', async () => {
    const manager = fakeManager(true);
    const reload = jest.fn(async () => {});
    await expect(applyLayoutDirection('en', manager, reload)).resolves.toBe(true);
    expect(manager.forced).toEqual([false]);
  });
});
