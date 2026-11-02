import { radius, space } from '@hufra/brand';
import type { PotholeStatus } from '@hufra/contracts';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { STATUS_LABEL, statusColors } from './status';

/** Status label on its tinted background (the design's badge). Always text, never colour alone. */
export function StatusBadge({ status }: { status: PotholeStatus }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const c = statusColors(colors, status);
  return (
    <View style={[styles.badge, { backgroundColor: c.bg }]}>
      <AppText variant="caption" style={[fontFor(600), { color: c.fg }]}>
        {t(STATUS_LABEL[status])}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.pill },
});
