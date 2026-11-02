import { radius, space } from '@hufra/brand';
import { CircleCheck, Eye } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { errorMessageKey } from '@/components/error-view';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

/**
 * "I saw it too" (design board 4, screen 2). Needs an account: mobile networks
 * in Libya put many phones behind one address, so anonymous confirmations
 * cannot be counted fairly.
 */
export function ConfirmBar({
  count,
  confirmed,
  signedIn,
  pending,
  error,
  onConfirm,
  onSignIn,
}: {
  count: number;
  confirmed: boolean;
  signedIn: boolean;
  pending: boolean;
  error: unknown;
  onConfirm: () => void;
  onSignIn: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const Icon = confirmed ? CircleCheck : Eye;
  const tint = confirmed ? colors.status.fixed.fg : colors.brand.primary;
  const label = confirmed ? t('detail.confirmed') : signedIn ? t('detail.confirm') : t('detail.confirmSignIn');

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.bg.surface, borderColor: colors.border.default, paddingBottom: Math.max(insets.bottom, space[5]) },
      ]}
    >
      <AppText variant="small" tone="secondary" style={styles.center} accessibilityLiveRegion="polite">
        {count > 0 ? t('detail.confirmedBy', { n: count }) : t('detail.confirmedNone')}
      </AppText>
      {error ? (
        <AppText variant="small" style={[styles.center, { color: colors.feedback.dangerFg }]} accessibilityRole="alert">
          {t(errorMessageKey(error))}
        </AppText>
      ) : null}
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: confirmed || pending, busy: pending }}
        accessibilityHint={confirmed ? undefined : t('detail.confirmHint')}
        disabled={confirmed || pending}
        onPress={signedIn ? onConfirm : onSignIn}
        style={({ pressed }) => [
          styles.button,
          {
            borderColor: tint,
            backgroundColor: confirmed ? colors.status.fixed.bg : pressed ? colors.bg.subtle : colors.bg.surface,
          },
        ]}
      >
        {pending ? <ActivityIndicator color={tint} /> : <Icon size={20} color={tint} />}
        <AppText variant="bodyStrong" style={{ color: tint }}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { borderTopWidth: 1, paddingHorizontal: space[7], paddingTop: space[4], gap: space[3] },
  center: { textAlign: 'center' },
  button: {
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
});
