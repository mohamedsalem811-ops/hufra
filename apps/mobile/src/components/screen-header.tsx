import { space } from '@hufra/brand';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { AppText } from './app-text';

/** Back button, title and an optional action, for pushed screens. */
export function ScreenHeader({ title, action }: { title: string; action?: ReactNode }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const Back = isRTL ? ChevronRight : ChevronLeft;
  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('detail.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.back, { backgroundColor: colors.bg.subtle }]}
      >
        <Back size={22} color={colors.text.primary} />
      </Pressable>
      <AppText variant="title3" accessibilityRole="header" style={styles.title} numberOfLines={1}>
        {title}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[5], paddingVertical: space[3] },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1 },
});
