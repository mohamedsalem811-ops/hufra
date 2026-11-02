import type { ColorTheme } from '@hufra/brand';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { secureStore } from '@/storage/secure';

import { colorsFor, resolveScheme, saveThemeMode, type ColorScheme, type ThemeMode } from './theme';

interface ThemeValue {
  mode: ThemeMode;
  scheme: ColorScheme;
  colors: ColorTheme;
  setMode: (mode: ThemeMode) => Promise<void>;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({ initialMode, children }: { initialMode: ThemeMode; children: ReactNode }) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(initialMode);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    await saveThemeMode(secureStore, next);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = resolveScheme(mode, system);
    return { mode, scheme, colors: colorsFor(scheme), setMode };
  }, [mode, system, setMode]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
