import { radius, space } from '@hufra/brand';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import { Bell, FileDown, FileText, HandHeart, Info, LogOut, Settings, ShieldCheck } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ListGroup, ListRow } from '@/components/list-group';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { openWebsite } from '../legal/website';
import { useDeleteAccount, useExportData, useMyReports, useNotifications } from './use-account';

/** "My account" tab (design board 5, screen 3; plan 6.6). */
export function AccountScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const { state, signOut } = useAuth();
  const signedIn = state.status === 'signedIn';
  const reports = useMyReports();
  const inbox = useNotifications();
  const exportData = useExportData();
  const deleteAccount = useDeleteAccount();
  const version = Constants.expoConfig?.version ?? '1.0.0';

  const list = reports.data?.results ?? [];
  const stats = [
    { label: 'myReports.statReports' as const, value: list.length, tone: undefined },
    { label: 'myReports.statFixed' as const, value: list.filter((r) => r.status === 'fixed').length, tone: colors.status.fixed.fg },
    { label: 'myReports.statConfirmations' as const, value: list.reduce((n, r) => n + r.upvotes_count, 0), tone: undefined },
  ];

  function runExport() {
    exportData.mutate(undefined, { onError: () => Alert.alert(t('account.exportFailed')) });
  }

  function confirmDelete() {
    Alert.alert(t('account.deleteTitle'), t('account.deleteBody'), [
      { text: t('detail.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: () =>
          deleteAccount.mutate(undefined, {
            onSuccess: () => Alert.alert(t('account.deleted')),
            onError: () => Alert.alert(t('account.deleteFailed')),
          }),
      },
    ]);
  }

  const user = signedIn ? state.user : null;
  const name = user?.display_name?.trim() || null;
  const initial = (name ?? user?.email ?? '؟').trim().charAt(0).toUpperCase();

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title1" accessibilityRole="header">
          {t('tabs.account')}
        </AppText>

        {user ? (
          <>
            <View style={styles.profile}>
              <View style={[styles.avatar, { backgroundColor: colors.brand.primary }]} accessibilityElementsHidden importantForAccessibility="no">
                <AppText variant="title2" style={{ color: colors.brand.onPrimary }}>
                  {initial}
                </AppText>
              </View>
              <View style={styles.flex}>
                {name ? <AppText variant="title3">{name}</AppText> : null}
                {user.email ? (
                  <AppText variant="small" tone="secondary" style={styles.ltr}>
                    {user.email}
                  </AppText>
                ) : null}
                {user.code ? (
                  <AppText variant="caption" tone="tertiary">
                    {t('account.yourCode', { code: user.code })}
                  </AppText>
                ) : null}
              </View>
            </View>
            <View style={styles.stats}>
              {stats.map((s) => (
                <View
                  key={s.label}
                  accessible
                  accessibilityLabel={`${t(s.label)}: ${s.value}`}
                  style={[styles.stat, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}
                >
                  <AppText variant="title2" style={s.tone ? { color: s.tone } : undefined}>
                    {reports.data ? s.value : '–'}
                  </AppText>
                  <AppText variant="small" tone="secondary">
                    {t(s.label)}
                  </AppText>
                </View>
              ))}
            </View>
          </>
        ) : state.status === 'signedOut' ? (
          <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
            <AppText tone="secondary">{t('account.signedOutHint')}</AppText>
            <Button label={t('auth.signIn.title')} onPress={() => router.push('/auth/sign-in')} />
            <Button variant="text" label={t('auth.createAccount')} onPress={() => router.push('/auth/sign-up')} />
          </View>
        ) : null}

        <ListGroup>
          {user ? (
            <ListRow
              icon={Bell}
              label={t('account.notifications')}
              value={inbox.data?.unread_count ? t('account.unread', { n: inbox.data.unread_count }) : undefined}
              onPress={() => router.push('/notifications')}
            />
          ) : null}
          {user ? <ListRow icon={HandHeart} label={t('account.donations')} onPress={() => router.push('/donations')} /> : null}
          {user ? (
            <ListRow icon={FileDown} label={t('account.export')} hint={t('account.exportHint')} busy={exportData.isPending} onPress={runExport} />
          ) : null}
          <ListRow icon={Settings} label={t('account.settings')} onPress={() => router.push('/settings')} />
          <ListRow icon={Info} role="link" label={t('account.about')} onPress={() => openWebsite(locale, '/how')} />
          <ListRow icon={ShieldCheck} role="link" label={t('account.trust')} onPress={() => openWebsite(locale, '/privacy')} />
          <ListRow icon={FileText} role="link" label={t('account.terms')} onPress={() => openWebsite(locale, '/terms')} />
        </ListGroup>

        {user ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => void signOut()}
              style={({ pressed }) => [
                styles.signOut,
                { borderColor: colors.border.default, backgroundColor: pressed ? colors.bg.subtle : colors.bg.surface },
              ]}
            >
              <LogOut size={20} color={colors.text.primary} />
              <AppText>{t('account.signOut')}</AppText>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={confirmDelete}
              disabled={deleteAccount.isPending}
              style={styles.delete}
              hitSlop={8}
            >
              <AppText style={[fontFor(600), { color: colors.feedback.dangerFg }]}>{t('account.delete')}</AppText>
            </Pressable>
          </>
        ) : null}

        <AppText variant="caption" tone="tertiary" style={styles.center}>
          {t('account.version', { version })}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space[7], gap: space[6] },
  profile: { flexDirection: 'row', alignItems: 'center', gap: space[5] },
  avatar: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },
  ltr: { writingDirection: 'ltr' },
  stats: { flexDirection: 'row', gap: space[3] },
  stat: { flex: 1, borderWidth: 1, borderRadius: radius.lg, padding: space[4], alignItems: 'center', gap: 2 },
  card: { borderWidth: 1, borderRadius: radius.lg + 2, padding: space[5], gap: space[4] },
  signOut: { minHeight: 52, borderWidth: 1, borderRadius: radius.lg + 2, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: space[4] },
  delete: { alignSelf: 'center', minHeight: 44, justifyContent: 'center' },
  center: { textAlign: 'center' },
});
