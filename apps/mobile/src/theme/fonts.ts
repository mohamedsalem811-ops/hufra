import type { TextStyle } from 'react-native';

/**
 * Readex Pro static instances from packages/brand (SIL Open Font License).
 * Android does not synthesise weights for custom fonts, so each weight is its
 * own family and text picks the family instead of a fontWeight.
 */
export const fontAssets = {
  'ReadexPro-Light': require('../../../../packages/brand/assets/fonts/ReadexPro-Light.ttf'),
  'ReadexPro-Regular': require('../../../../packages/brand/assets/fonts/ReadexPro-Regular.ttf'),
  'ReadexPro-Medium': require('../../../../packages/brand/assets/fonts/ReadexPro-Medium.ttf'),
  'ReadexPro-SemiBold': require('../../../../packages/brand/assets/fonts/ReadexPro-SemiBold.ttf'),
  'ReadexPro-Bold': require('../../../../packages/brand/assets/fonts/ReadexPro-Bold.ttf'),
} as const;

export type FontWeight = 300 | 400 | 500 | 600 | 700;

const FAMILY: Record<FontWeight, keyof typeof fontAssets> = {
  300: 'ReadexPro-Light',
  400: 'ReadexPro-Regular',
  500: 'ReadexPro-Medium',
  600: 'ReadexPro-SemiBold',
  700: 'ReadexPro-Bold',
};

export function fontFor(weight: FontWeight): Pick<TextStyle, 'fontFamily'> {
  return { fontFamily: FAMILY[weight] };
}
