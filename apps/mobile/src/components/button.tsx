import { radius, space, touchTarget } from '@hufra/brand';
import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/theme-provider';

import { AppText } from './app-text';

type Variant = 'primary' | 'secondary' | 'text';

interface ButtonProps extends Omit<PressableProps, 'style' | 'children'> {
  label: string;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
}

/**
 * primary: signal orange, dark text (brand rule: orange is a fill, text on it is dark).
 * secondary: outlined in brand blue. text: link-style, still a 48 px touch target.
 */
export function Button({ label, variant = 'primary', style, disabled, ...rest }: ButtonProps) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      {...rest}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' && {
          backgroundColor: pressed ? colors.action.primaryPressed : colors.action.primary,
          minHeight: touchTarget + 8,
        },
        variant === 'secondary' && {
          borderWidth: 1.5,
          borderColor: colors.brand.primary,
          backgroundColor: pressed ? colors.bg.brandTint : colors.bg.surface,
        },
        variant === 'text' && { opacity: pressed ? 0.6 : 1 },
        disabled && styles.disabled,
        style,
      ]}
    >
      <AppText
        variant="bodyStrong"
        style={{
          color:
            variant === 'primary' ? colors.action.onPrimary : variant === 'secondary' ? colors.brand.primary : colors.text.link,
        }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.lg,
    paddingHorizontal: space[7],
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.5 },
});
