import { radius, space } from '@hufra/brand';
import type { Notification } from '@hufra/contracts';
import { useRouter } from 'expo-router';
import { BellRing } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ErrorView } from '@/components/error-view';
import { ScreenHeader } from '@/components/screen-header';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { GROUP_LABEL, groupInbox, inboxTime } from './inbox';
import { readNotification, useMarkAllRead, useNotificationPages, useNotifications } from './use-account';

/** Inbox (design board 4, screen 4): newest first, grouped by day, unread marked. */
export function NotificationsScreen() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const inbox = useNotifications();
  const pages = useNotificationPages();
  const markAll = useMarkAllRead();
  const [refreshing, setRefreshing] = useState(false);
  const unread = inbox.data?.unread_count ?? 0;

  const action = unread ? (
    <Pressable accessibilityRole="button" onPress={() => markAll.mutate()} disabled={markAll.isPending} hitSlop={8} style={styles.action}>
      <AppText variant="small" style={[fontFor(600), { color: colors.text.link }]}>
        {t('notifications.readAll')}
      </AppText>
    </Pressable>
  ) : undefined;

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScreenHeader title={t('notifications.title')} action={action} />
      {pages.isError && !pages.data ? (
        <ErrorView error={pages.error} onRetry={() => pages.refetch()} />
      ) : !pages.data ? (
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
                await Promise.allSettled([inbox.refetch(), pages.refetch()]);
                setRefreshing(false);
              }}
            />
          }
        >
          {pages.items.length === 0 ? (
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.bg.brandTint }]}>
                <BellRing size={32} color={colors.brand.primary} />
              </View>
              <AppText tone="secondary" style={styles.center}>
                {t('notifications.empty')}
              </AppText>
            </View>
          ) : (
            groupInbox(pages.items).map(({ group, items }) => (
              <View key={group} style={styles.group}>
                <AppText variant="small" tone="secondary" accessibilityRole="header">
                  {t(GROUP_LABEL[group])}
                </AppText>
                {items.map((n) => (
                  <InboxRow key={n.id} item={n} />
                ))}
              </View>
            ))
          )}
          {pages.hasNextPage ? (
            <Button variant="secondary" label={t('list.more')} disabled={pages.isFetchingNextPage} onPress={() => void pages.loadMore()} />
          ) : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function InboxRow({ item }: { item: Notification }) {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { title, body, potholeId } = readNotification(item.payload_json, locale);
  const unread = !item.read_at;
  const when = inboxTime(item.created_at, locale, t);
  return (
    <Pressable
      accessibilityRole={potholeId ? 'button' : undefined}
      accessibilityLabel={[unread ? t('notifications.unread') : null, title, body, when].filter(Boolean).join('، ')}
      disabled={!potholeId}
      onPress={() => potholeId && router.push({ pathname: '/pothole/[id]', params: { id: String(potholeId) } })}
      style={({ pressed }) => [
        styles.row,
        {
          backgroundColor: pressed ? colors.bg.subtle : unread ? colors.bg.brandTint : colors.bg.surface,
          borderColor: colors.border.default,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: unread ? colors.action.primary : 'transparent' }]} />
      <View style={styles.text}>
        <AppText variant={unread ? 'bodyStrong' : 'body'}>{title || t('notifications.title')}</AppText>
        {body ? (
          <AppText variant="small" tone="secondary">
            {body}
          </AppText>
        ) : null}
        <AppText variant="caption" tone="tertiary">
          {when}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  loading: { marginTop: space[9] },
  content: { padding: space[7], paddingTop: space[3], gap: space[7] },
  action: { minHeight: 44, justifyContent: 'center' },
  group: { gap: space[3] },
  row: { flexDirection: 'row', gap: space[4], borderWidth: 1, borderRadius: radius.lg, padding: space[5] },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: space[3] },
  text: { flex: 1, gap: space[1] },
  empty: { alignItems: 'center', gap: space[5], paddingTop: space[9] },
  emptyIcon: { width: 72, height: 72, borderRadius: radius.lg, alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
});
