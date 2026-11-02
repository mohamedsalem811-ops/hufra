import { radius, space, touchTarget } from '@hufra/brand';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

/**
 * Placeholder first screen until onboarding lands in Phase 5.4. The language
 * button lets the owner check Arabic/English and right-to-left on a real phone.
 */
export function Welcome() {
  const { colors } = useTheme();
  const { t, locale, setLocale } = useI18n();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.brand.primary }]}>
      <View style={styles.content}>
        <AppText variant="display" tone="onBrand" accessibilityRole="header">
          {t('app.name')}
        </AppText>
        <AppText variant="title3" tone="onBrand" style={styles.center}>
          {t('app.tagline')}
        </AppText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('language.switchToLabel')}
        onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
        style={({ pressed }) => [styles.language, { borderColor: colors.brand.onPrimary, opacity: pressed ? 0.7 : 1 }]}
      >
        <AppText variant="bodyStrong" tone="onBrand">
          {t('language.switchTo')}
        </AppText>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space[7] },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  center: { textAlign: 'center' },
  language: {
    alignSelf: 'center',
    minHeight: touchTarget,
    paddingHorizontal: space[7],
    borderWidth: 1.5,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space[5],
  },
});
