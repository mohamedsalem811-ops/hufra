import { radius, space } from '@hufra/brand';
import { Check, type LucideIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useTheme } from '@/theme/theme-provider';

export interface PermissionStepProps {
  step: number;
  total: number;
  icon: LucideIcon;
  title: MessageKey;
  body: MessageKey;
  points?: MessageKey[];
  allowLabel: MessageKey;
  /** Shows the system prompt; resolves whatever the person chose. */
  onAllow: () => Promise<unknown>;
  /** Next screen, after either choice. */
  onDone: () => void;
  onSkip: () => void;
}

/**
 * "Benefit first" explanation shown before each system permission prompt
 * (design board 1, screens 2 and 3). Either answer moves on; nothing is blocked.
 */
export function PermissionStep({
  step,
  total,
  icon: Icon,
  title,
  body,
  points = [],
  allowLabel,
  onAllow,
  onDone,
  onSkip,
}: PermissionStepProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [asking, setAsking] = useState(false);

  async function allow() {
    setAsking(true);
    try {
      await onAllow();
    } finally {
      setAsking(false);
      onDone();
    }
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <View style={styles.top}>
        <View style={styles.dots} accessible accessibilityLabel={t('onboarding.stepOf', { n: step, total })}>
          {Array.from({ length: total }, (_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                i + 1 === step ? styles.dotActive : null,
                { backgroundColor: i + 1 === step ? colors.brand.primary : colors.border.strong },
              ]}
            />
          ))}
        </View>
        <Button variant="text" label={t('onboarding.skip')} onPress={onSkip} />
      </View>

      <View style={[styles.illustration, { backgroundColor: colors.bg.brandTint }]}>
        <View style={[styles.iconCircle, { backgroundColor: colors.bg.surface }]}>
          <Icon size={56} color={colors.brand.primary} strokeWidth={1.75} />
        </View>
      </View>

      <View style={styles.text}>
        <AppText variant="title1" accessibilityRole="header">
          {t(title)}
        </AppText>
        <AppText tone="secondary">{t(body)}</AppText>
      </View>

      {points.length > 0 ? (
        <View style={styles.points}>
          {points.map((point) => (
            <View key={point} style={styles.point}>
              <Check size={20} color={colors.feedback.successFg} strokeWidth={2.5} />
              <AppText variant="small" tone="secondary" style={styles.pointText}>
                {t(point)}
              </AppText>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.footer}>
        <Button label={t(allowLabel)} onPress={allow} disabled={asking} />
        <Button variant="text" label={t('onboarding.notNow')} onPress={onDone} disabled={asking} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: space[7], gap: space[7] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space[5] },
  dots: { flexDirection: 'row', gap: space[2], alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotActive: { width: 24 },
  illustration: { height: 220, borderRadius: radius.xxl - 4, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  text: { gap: space[4] },
  points: { gap: space[4] },
  point: { flexDirection: 'row', gap: space[4], alignItems: 'flex-start' },
  pointText: { flex: 1 },
  footer: { marginTop: 'auto', gap: space[3], paddingBottom: space[7] },
});
