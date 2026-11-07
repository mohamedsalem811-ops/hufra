import { radius, space } from '@hufra/brand';
import type { MyPotholesResponse } from '@hufra/contracts';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, ClipboardList, MapPin } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { errorMessageKey } from '@/components/error-view';
import { Segmented } from '@/components/segmented';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { useMyReportPages } from '../account/use-account';
import { useAuth } from '../auth/auth-provider';
import { OutboxList } from '../outbox/outbox-list';
import { useOutbox } from '../outbox/outbox-provider';
import { daysBetween, daysText } from '../report-detail/model';
import { mediaUrl, placeName } from '../reports/format';
import { StatusBadge } from '../reports/status-badge';

type Filter = 'all' | 'open' | 'fixed';
type Mine = MyPotholesResponse['results'][number];

export function filterMine(list: readonly Mine[], filter: Filter): Mine[] {
  if (filter === 'all') return [...list];
  return list.filter((r) => (filter === 'fixed' ? r.status === 'fixed' : r.status !== 'fixed'));
}

/** "My reports" tab (design board 4, screen 3): waiting-to-send first, then sent reports by status. */
export function MyReportsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state } = useAuth();
  const outbox = useOutbox();
  const reports = useMyReportPages();
  const [filter, setFilter] = useState<Filter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const list = reports.items;
  const shown = filterMine(list, filter);
  const hasAny = list.length > 0 || outbox.items.length > 0;

  async function refresh() {
    setRefreshing(true);
    await Promise.allSettled([reports.refetch(), outbox.flush()]);
    setRefreshing(false);
  }

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          state.status === 'signedIn' ? (
            <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand.primary} />
          ) : undefined
        }
      >
        <AppText variant="title1" accessibilityRole="header">
          {t('tabs.myReports')}
        </AppText>

        <OutboxList />

        {state.status === 'signedOut' ? (
          <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
            <AppText tone="secondary">{t('myReports.signedOut')}</AppText>
            <Button label={t('auth.signIn.title')} onPress={() => router.push('/auth/sign-in')} />
            <Button variant="text" label={t('auth.createAccount')} onPress={() => router.push('/auth/sign-up')} />
          </View>
        ) : state.status === 'loading' || reports.isPending ? (
          <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
        ) : reports.isError && !reports.data ? (
          <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]} accessibilityRole="alert">
            <AppText tone="secondary">{t(errorMessageKey(reports.error))}</AppText>
            <Button variant="secondary" label={t('error.retry')} onPress={() => reports.refetch()} />
          </View>
        ) : !hasAny ? (
          <View style={styles.empty}>
            <View style={[styles.emptyIcon, { backgroundColor: colors.bg.brandTint }]}>
              <ClipboardList size={32} color={colors.brand.primary} />
            </View>
            <AppText variant="title2" style={styles.center}>
              {t('myReports.emptyTitle')}
            </AppText>
            <AppText tone="secondary" style={styles.center}>
              {t('myReports.emptyBody')}
            </AppText>
            <Button label={t('home.reportOne')} onPress={() => router.push('/new-report')} style={styles.stretch} />
          </View>
        ) : list.length > 0 ? (
          <>
            <Segmented
              title={t('myReports.sent')}
              options={(['all', 'open', 'fixed'] as const).map((f) => ({
                key: f,
                label: t(`myReports.${f}`, { n: filterMine(list, f).length }),
                selected: f === filter,
              }))}
              onSelect={(key) => setFilter(key as Filter)}
            />
            {shown.length === 0 ? (
              <AppText tone="secondary">{t('myReports.noneInFilter')}</AppText>
            ) : (
              <View style={styles.list}>
                {shown.map((r) => (
                  <MineRow key={r.id} item={r} onPress={() => router.push({ pathname: '/pothole/[id]', params: { id: String(r.id) } })} />
                ))}
              </View>
            )}
            {reports.hasNextPage ? (
              <Button
                variant="secondary"
                label={t('list.more')}
                disabled={reports.isFetchingNextPage}
                onPress={() => void reports.loadMore()}
              />
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function MineRow({ item, onPress }: { item: Mine; onPress: () => void }) {
  const { colors } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const p = placeName(item, locale);
  const age = daysBetween(item.created_at, new Date().toISOString());
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? colors.bg.subtle : colors.bg.surface, borderColor: colors.border.default },
      ]}
    >
      <View style={[styles.thumb, { backgroundColor: colors.bg.subtle }]}>
        {item.cover_thumb_key ? (
          <Image source={mediaUrl(item.cover_thumb_key)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
        ) : (
          <MapPin size={22} color={colors.text.tertiary} />
        )}
      </View>
      <View style={styles.info}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {p.street ?? p.area}
        </AppText>
        <View style={styles.meta}>
          <StatusBadge status={item.status} />
          <AppText variant="small" tone="secondary">
            {age === 0 ? t('detail.today') : t('detail.ago', { days: daysText(age, locale) })}
          </AppText>
        </View>
      </View>
      <Chevron size={20} color={colors.text.tertiary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space[7], gap: space[6] },
  loading: { marginTop: space[9] },
  card: { borderWidth: 1, borderRadius: radius.lg + 2, padding: space[5], gap: space[4] },
  empty: { alignItems: 'center', gap: space[4], paddingTop: space[7] },
  emptyIcon: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  stretch: { alignSelf: 'stretch' },
  list: { gap: space[3] },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[4], borderWidth: 1, borderRadius: radius.lg + 2, padding: space[4] },
  thumb: { width: 60, height: 60, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: space[2] },
  meta: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
});
