import type { ColorTheme } from '@hufra/brand';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { secureStore } from '@/storage/secure';

import {
  colorsFor,
  resolveScheme,
  saveTextSize,
  saveThemeMode,
  TEXT_SCALE,
  type ColorScheme,
  type TextSize,
  type ThemeMode,
} from './theme';

interface ThemeValue {
  mode: ThemeMode;
  scheme: ColorScheme;
  colors: ColorTheme;
  setMode: (mode: ThemeMode) => Promise<void>;
  textSize: TextSize;
  /** Multiplier for every font size and line height (AppText). */
  textScale: number;
  setTextSize: (size: TextSize) => Promise<void>;
}

const ThemeContext = createContext<ThemeValue | null>(null);

export function ThemeProvider({
  initialMode,
  initialTextSize = 'default',
  children,
}: {
  initialMode: ThemeMode;
  initialTextSize?: TextSize;
  children: ReactNode;
}) {
  const system = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(initialMode);
  const [textSize, setTextSizeState] = useState<TextSize>(initialTextSize);

  const setMode = useCallback(async (next: ThemeMode) => {
    setModeState(next);
    await saveThemeMode(secureStore, next);
  }, []);

  const setTextSize = useCallback(async (next: TextSize) => {
    setTextSizeState(next);
    await saveTextSize(secureStore, next);
  }, []);

  const value = useMemo<ThemeValue>(() => {
    const scheme = resolveScheme(mode, system);
    return { mode, scheme, colors: colorsFor(scheme), setMode, textSize, textScale: TEXT_SCALE[textSize], setTextSize };
  }, [mode, system, setMode, textSize, setTextSize]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme must be used inside <ThemeProvider>');
  return value;
}
