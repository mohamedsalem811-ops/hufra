import { radius, space } from '@hufra/brand';
import { Image } from 'expo-image';
import { CloudUpload, TriangleAlert } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { formatDate } from '../reports/format';
import { useOutbox } from './outbox-provider';
import type { OutboxItem } from './store';

/** Reports kept on the phone (design board 4 "My reports", first card; board 6 screen 2). */
export function OutboxList() {
  const { items, flush } = useOutbox();
  const { state } = useAuth();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  if (items.length === 0) return null;
  const hasPending = items.some((i) => i.status === 'pending');

  return (
    <View style={styles.section} accessibilityLabel={t('outbox.title')}>
      <AppText variant="title3" accessibilityRole="header">
        {t('outbox.title')}
      </AppText>
      {items.map((item) => (
        <OutboxCard key={item.uuid} item={item} />
      ))}
      {state.status === 'signedOut' ? (
        <AppText variant="small" tone="secondary">
          {t('outbox.signInToSend')}
        </AppText>
      ) : hasPending ? (
        <Button
          variant="secondary"
          label={t('outbox.sendNow')}
          disabled={busy}
          onPress={async () => {
            setBusy(true);
            await flush().finally(() => setBusy(false));
          }}
        />
      ) : null}
    </View>
  );
}

function OutboxCard({ item }: { item: OutboxItem }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { remove } = useOutbox();
  const failed = item.status === 'failed';
  const street = (locale === 'ar' ? item.input.street_ar ?? item.input.street_en : item.input.street_en ?? item.input.street_ar) || t('map.unknownStreet');
  const Icon = failed ? TriangleAlert : CloudUpload;

  function confirmDelete() {
    Alert.alert(t('outbox.deleteConfirm'), undefined, [
      { text: t('report.leave.cancel'), style: 'cancel' },
      { text: t('outbox.delete'), style: 'destructive', onPress: () => remove(item.uuid) },
    ]);
  }

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: colors.bg.surface, borderColor: failed ? colors.feedback.dangerFg : colors.border.strong },
      ]}
    >
      <View style={styles.row}>
        <View style={[styles.thumb, { backgroundColor: colors.bg.subtle }]}>
          {item.photos[0] ? (
            <Image source={item.photos[0].uri} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
          ) : null}
          <View style={[styles.iconBadge, { backgroundColor: colors.bg.surface }]}>
            <Icon size={16} color={failed ? colors.feedback.dangerFg : colors.text.secondary} />
          </View>
        </View>
        <View style={styles.info}>
          <AppText variant="bodyStrong" numberOfLines={1}>
            {street}
          </AppText>
          <View style={[styles.badge, { backgroundColor: failed ? colors.feedback.dangerBg : colors.bg.subtle }]}>
            <AppText variant="caption" style={[fontFor(600), { color: failed ? colors.feedback.dangerFg : colors.text.primary }]}>
              {failed ? t('outbox.failed') : t('outbox.waiting')}
            </AppText>
          </View>
          <AppText variant="small" tone="secondary">
            {formatDate(item.createdAt, locale)} · {t('outbox.photos', { n: item.photos.length })}
          </AppText>
        </View>
      </View>
      <AppText variant="small" tone="secondary">
        {failed ? item.lastError ?? t('outbox.failedHint') : t('outbox.waitingHint')}
      </AppText>
      {failed ? <Button variant="text" label={t('outbox.delete')} onPress={confirmDelete} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: space[4] },
  card: { borderWidth: 1.5, borderStyle: 'dashed', borderRadius: radius.lg + 2, padding: space[5], gap: space[3] },
  row: { flexDirection: 'row', gap: space[4] },
  thumb: { width: 60, height: 60, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  iconBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: space[2] },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.pill },
});
