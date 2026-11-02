import { radius, space, touchTarget } from '@hufra/brand';
import { Pressable, StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/client';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { AppText } from './app-text';

/** Plain-language message for any error: never a code, never blame (VOICE.md). */
export function errorMessageKey(error: unknown): MessageKey {
  if (error instanceof ApiError) {
    if (error.kind === 'network') return 'error.network';
    if (error.kind === 'timeout') return 'error.timeout';
    if (error.kind === 'unauthorized') return 'error.signedOut';
    return 'error.server';
  }
  return 'error.body';
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg.canvas }]} accessibilityRole="alert">
      <AppText variant="title2" style={styles.center}>
        {t('error.title')}
      </AppText>
      <AppText tone="secondary" style={styles.center}>
        {t(errorMessageKey(error))}
      </AppText>
      {onRetry ? (
        <Pressable
          accessibilityRole="button"
          onPress={onRetry}
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: pressed ? colors.action.primaryPressed : colors.action.primary },
          ]}
        >
          <AppText variant="bodyStrong" style={[fontFor(700), { color: colors.action.onPrimary }]}>
            {t('error.retry')}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[5], padding: space[8] },
  center: { textAlign: 'center' },
  button: {
    minHeight: touchTarget + 8,
    paddingHorizontal: space[8],
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
