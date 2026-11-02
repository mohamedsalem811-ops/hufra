import { radius, space } from '@hufra/brand';
import { Image } from 'expo-image';
import { Camera, Check, MapPin, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { brandAssets } from '@/theme/brand-assets';
import { useTheme } from '@/theme/theme-provider';

const STEPS: { icon: LucideIcon; title: MessageKey; body: MessageKey; done?: boolean }[] = [
  { icon: Camera, title: 'onboarding.step1.title', body: 'onboarding.step1.body' },
  { icon: MapPin, title: 'onboarding.step2.title', body: 'onboarding.step2.body' },
  { icon: Check, title: 'onboarding.step3.title', body: 'onboarding.step3.body', done: true },
];

/** First-run welcome (design board 1, screen 1). */
export function Welcome({ onStart }: { onStart: () => void }) {
  const { colors } = useTheme();
  const { t, locale, setLocale } = useI18n();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <View style={[styles.hero, { backgroundColor: colors.brand.primary }]}>
        <SafeAreaView edges={['top']} style={styles.heroInner}>
          <Button
            variant="text"
            label={t('language.switchTo')}
            accessibilityLabel={t('language.switchToLabel')}
            onPress={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
            style={styles.language}
          />
          <Image
            source={brandAssets.lockupStackedOnDark}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel={t('app.name')}
          />
          <AppText variant="title2" tone="onBrand" style={styles.center} accessibilityRole="header">
            {t('app.tagline')}
          </AppText>
        </SafeAreaView>
      </View>

      <View style={styles.steps}>
        {STEPS.map(({ icon: Icon, title, body, done }) => (
          <View key={title} style={styles.step}>
            <View
              style={[
                styles.stepIcon,
                { backgroundColor: done ? colors.feedback.successBg : colors.bg.brandTint },
              ]}
            >
              <Icon size={22} color={done ? colors.feedback.successFg : colors.brand.primary} strokeWidth={2} />
            </View>
            <View style={styles.stepText}>
              <AppText variant="bodyStrong">{t(title)}</AppText>
              <AppText variant="small" tone="secondary">
                {t(body)}
              </AppText>
            </View>
          </View>
        ))}
      </View>

      <SafeAreaView edges={['bottom']} style={styles.footer}>
        <Button label={t('onboarding.start')} onPress={onStart} />
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hero: { borderBottomLeftRadius: radius.xxl, borderBottomRightRadius: radius.xxl },
  heroInner: { alignItems: 'center', gap: space[6], paddingHorizontal: space[8], paddingBottom: space[9] },
  language: { alignSelf: 'flex-end', paddingHorizontal: space[4] },
  logo: { width: 200, height: 170 },
  center: { textAlign: 'center' },
  steps: { padding: space[8], gap: space[6] },
  step: { flexDirection: 'row', alignItems: 'center', gap: space[5] },
  stepIcon: { width: 44, height: 44, borderRadius: radius.md + 2, alignItems: 'center', justifyContent: 'center' },
  stepText: { flex: 1, gap: space[1] },
  footer: { marginTop: 'auto', paddingHorizontal: space[7], paddingBottom: space[8] },
});
