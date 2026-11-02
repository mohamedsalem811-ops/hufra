import { typeScale } from '@hufra/brand';
import { StyleSheet, Text, type TextProps } from 'react-native';

import { fontFor, type FontWeight } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

export type TextVariant = keyof typeof typeScale;
type Tone = 'primary' | 'secondary' | 'inverse' | 'onBrand';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  tone?: Tone;
}

/** All app text: brand type scale, Readex Pro, theme colour. Alignment follows the language. */
export function AppText({ variant = 'body', tone = 'primary', style, ...rest }: AppTextProps) {
  const { colors } = useTheme();
  const scale = typeScale[variant];
  const color =
    tone === 'onBrand' ? colors.brand.onPrimary : tone === 'inverse' ? colors.text.inverse : colors.text[tone];
  return (
    <Text
      {...rest}
      style={[
        styles.base,
        fontFor(scale.weight as FontWeight),
        { fontSize: scale.size, lineHeight: scale.lineHeight, color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  base: { writingDirection: 'auto' },
});
