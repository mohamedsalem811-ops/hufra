import { radius, space } from '@hufra/brand';
import type { Donation, DonationStatus } from '@hufra/contracts';
import { useRouter } from 'expo-router';
import { HandHeart } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ErrorView } from '@/components/error-view';
import { ScreenHeader } from '@/components/screen-header';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { formatDate } from '../reports/format';
import { formatLyd } from './money';
import { useMyDonations, useOpenDonationPage } from './use-donations';

const STATUS_LABEL: Record<DonationStatus, MessageKey> = {
  awaiting_transfer: 'donations.s.awaiting',
  under_review: 'donations.s.review',
  confirmed: 'donations.s.confirmed',
  rejected: 'donations.s.rejected',
  expired: 'donations.s.expired',
  cancelled: 'donations.s.cancelled',
};

/** Sum of confirmed donations, dinar (thousandths kept exact). */
export function confirmedTotal(list: readonly Donation[]): number {
  return list.filter((d) => d.status === 'confirmed').reduce((sum, d) => sum + Math.round(d.amount_lyd * 1000), 0) / 1000;
}

/**
 * "My donations" (design board 9, screen 5), read-only in the app: the
 * transfer steps and receipts live on the website, opened from each row.
 */
export function MyDonationsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const query = useMyDonations();
  const { open } = useOpenDonationPage();
  const [refreshing, setRefreshing] = useState(false);

  if (query.isError && !query.data) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;
  const list = query.data?.results ?? [];

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScreenHeader title={t('donations.title')} />
      {!query.data ? (
        <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              tintColor={colors.brand.primary}
              onRefresh={async () => {
                setRefreshing(true);
                await query.refetch();
                setRefreshing(false);
              }}
            />
          }
        >
          <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
            <AppText variant="small" tone="secondary">
              {t('donations.total')}
            </AppText>
            <AppText variant="title2">{formatLyd(confirmedTotal(list), locale)}</AppText>
          </View>
          {list.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.bg.brandTint }]}>
                <HandHeart size={32} color={colors.brand.primary} />
              </View>
              <AppText tone="secondary" style={styles.center}>
                {t('donations.empty')}
              </AppText>
              <Button variant="secondary" label={t('home.onMap')} onPress={() => router.navigate('/map')} style={styles.stretch} />
            </View>
          ) : (
            list.map((d) => {
              const street = (locale === 'ar' ? d.street_ar ?? d.street_en : d.street_en ?? d.street_ar) || t('map.unknownStreet');
              const badge =
                d.status === 'confirmed'
                  ? { bg: colors.status.fixed.bg, fg: colors.status.fixed.fg }
                  : d.status === 'rejected'
                    ? { bg: colors.feedback.dangerBg, fg: colors.feedback.dangerFg }
                    : { bg: colors.bg.subtle, fg: colors.text.primary };
              return (
                <Pressable
                  key={d.id}
                  accessibilityRole="button"
                  onPress={() => void open(`/donations/${d.id}`)}
                  style={({ pressed }) => [
                    styles.card,
                    { backgroundColor: pressed ? colors.bg.subtle : colors.bg.surface, borderColor: colors.border.default },
                  ]}
                >
                  <View style={styles.row}>
                    <AppText variant="bodyStrong" style={styles.flex} numberOfLines={1}>
                      {street} · {formatLyd(d.amount_lyd, locale)}
                    </AppText>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <AppText variant="caption" style={[fontFor(600), { color: badge.fg }]}>
                        {t(STATUS_LABEL[d.status])}
                      </AppText>
                    </View>
                  </View>
                  <AppText variant="small" tone="secondary">
                    {d.reference_code} · {formatDate(d.reviewed_at ?? d.created_at, locale)}
                  </AppText>
                  {d.status === 'awaiting_transfer' ? (
                    <AppText variant="small" style={[fontFor(600), { color: colors.text.link }]}>
                      {t('donations.finish')}
                    </AppText>
                  ) : null}
                  {d.status === 'rejected' && d.reject_reason ? (
                    <AppText variant="small" tone="secondary">
                      {t('donations.reason', { r: d.reject_reason })}
                    </AppText>
                  ) : null}
                </Pressable>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: space[9] },
  content: { padding: space[7], paddingTop: space[3], gap: space[4] },
  card: { borderWidth: 1, borderRadius: radius.lg + 2, padding: space[5], gap: space[2] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  badge: { paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.pill },
  empty: { alignItems: 'center', gap: space[4], paddingTop: space[7] },
  emptyIcon: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
});
