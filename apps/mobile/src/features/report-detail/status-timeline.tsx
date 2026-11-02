import { space } from '@hufra/brand';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { formatDate } from '../reports/format';
import { STATUS_LABEL, statusColors } from '../reports/status';
import type { TimelineEntry } from './model';

/** Every status with its date, newest first; notes come from the repair team (design board 4). */
export function StatusTimeline({ entries }: { entries: TimelineEntry[] }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  return (
    <View style={styles.root}>
      <AppText variant="title3" accessibilityRole="header">
        {t('detail.timeline')}
      </AppText>
      <View accessibilityRole="list">
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          const current = i === 0;
          return (
            <View key={`${e.status}-${e.at}`} style={styles.row} accessible>
              <View style={styles.rail}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: current ? statusColors(colors, e.status).pin : colors.border.strong },
                  ]}
                />
                {!last ? <View style={[styles.line, { backgroundColor: colors.border.default }]} /> : null}
              </View>
              <View style={[styles.text, !last && styles.gap]}>
                <AppText variant="bodyStrong">
                  {t(STATUS_LABEL[e.status])} · {formatDate(e.at, locale)}
                </AppText>
                {e.note ? (
                  <AppText variant="small" tone="secondary">
                    {t('detail.teamNote', { note: e.note })}
                  </AppText>
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[4] },
  row: { flexDirection: 'row', gap: space[4] },
  rail: { alignItems: 'center', width: 14 },
  dot: { width: 14, height: 14, borderRadius: 7, marginTop: 6 },
  line: { width: 2, flex: 1, minHeight: 22, marginTop: space[1] },
  text: { flex: 1, gap: space[1] },
  gap: { paddingBottom: space[5] },
});
