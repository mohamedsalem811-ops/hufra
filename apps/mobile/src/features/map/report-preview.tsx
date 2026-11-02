import { radius, space } from '@hufra/brand';
import type { PublicPotholeListItem } from '@hufra/contracts';
import { Image } from 'expo-image';
import { Eye, ImageIcon, X } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { formatDate, mediaUrl, placeName } from '../reports/format';
import { SEVERITY_LABEL } from '../reports/status';
import { StatusBadge } from '../reports/status-badge';

/** Card shown over the map after tapping a pin (design board 2, screen 3). */
export function ReportPreview({
  report,
  onClose,
  onOpen,
}: {
  report: PublicPotholeListItem;
  onClose: () => void;
  onOpen: () => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { street, area } = placeName(report, locale);
  const thumb = mediaUrl(report.cover_thumb_key);

  return (
    <View
      accessibilityRole="summary"
      style={[styles.card, { backgroundColor: colors.bg.surface, shadowColor: colors.text.primary }]}
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: colors.bg.subtle }]}>
          {thumb ? (
            <Image source={thumb} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} accessible={false} />
          ) : (
            <ImageIcon size={28} color={colors.text.tertiary} />
          )}
        </View>
        <View style={styles.info}>
          <StatusBadge status={report.status} />
          <AppText variant="title3" numberOfLines={2}>
            {street ?? t('map.unknownStreet')}
          </AppText>
          <AppText variant="small" tone="secondary">
            {area} · {t(SEVERITY_LABEL[report.severity])}
          </AppText>
          <AppText variant="small" tone="secondary">
            {t('map.reportedOn', { date: formatDate(report.created_at, locale) })}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('map.close')}
          onPress={onClose}
          hitSlop={8}
          style={[styles.close, { backgroundColor: colors.bg.subtle }]}
        >
          <X size={18} color={colors.text.primary} />
        </Pressable>
      </View>

      {report.upvotes_count > 0 ? (
        <View style={styles.confirm}>
          <Eye size={18} color={colors.text.secondary} />
          <AppText variant="small" tone="secondary">
            {t('map.confirmations', { n: report.upvotes_count })}
          </AppText>
        </View>
      ) : null}

      <Button variant="secondary" label={t('map.viewDetails')} onPress={onOpen} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl + 4,
    padding: space[6],
    gap: space[5],
    shadowOpacity: 0.14,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 8,
  },
  row: { flexDirection: 'row', gap: space[5] },
  thumb: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: space[2] },
  close: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
