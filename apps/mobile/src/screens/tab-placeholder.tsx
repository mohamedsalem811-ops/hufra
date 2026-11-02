import { radius, space } from '@hufra/brand';
import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useTheme } from '@/theme/theme-provider';

/** Temporary body for a tab whose real screen arrives in Phase 6. */
export function TabPlaceholder({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: MessageKey;
  children?: ReactNode;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <AppText variant="title1" accessibilityRole="header">
        {t(title)}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
        <View style={[styles.icon, { backgroundColor: colors.bg.brandTint }]}>
          <Icon size={32} color={colors.brand.primary} strokeWidth={1.75} />
        </View>
        <AppText tone="secondary" style={styles.center}>
          {t('placeholder.soon')}
        </AppText>
      </View>
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: space[7], gap: space[7] },
  card: {
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: space[8],
    alignItems: 'center',
    gap: space[5],
  },
  icon: { width: 64, height: 64, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
