import { themes, type ColorTheme } from '@hufra/brand';
import { useColorScheme } from 'react-native';

/** Brand colours for the phone's current light/dark setting (packages/brand). */
export function useTheme(): ColorTheme {
  return useColorScheme() === 'dark' ? themes.dark : themes.light;
}
