import { radius, space } from '@hufra/brand';
import { useFocusEffect } from 'expo-router';
import { Bell, Camera, MapPin } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { ScreenHeader } from '@/components/screen-header';
import { Segmented } from '@/components/segmented';
import { useI18n } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages';
import { permissionStates, type PermissionResult } from '@/permissions/permissions';
import type { TextSize, ThemeMode } from '@/theme/theme';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { useNotificationPreferences } from './use-preferences';

const THEMES: { mode: ThemeMode; label: MessageKey }[] = [
  { mode: 'system', label: 'account.theme.system' },
  { mode: 'light', label: 'account.theme.light' },
  { mode: 'dark', label: 'account.theme.dark' },
];
const SIZES: { size: TextSize; label: MessageKey }[] = [
  { size: 'default', label: 'account.textSize.default' },
  { size: 'large', label: 'account.textSize.large' },
  { size: 'larger', label: 'account.textSize.larger' },
];
const STATE_LABEL: Record<PermissionResult, MessageKey> = {
  granted: 'settings.allowed',
  denied: 'settings.denied',
  undetermined: 'settings.notAsked',
};

/** Settings (design board 5, screen 4): language, appearance, text size, permissions. */
export function SettingsScreen() {
  const { colors, mode, setMode, textSize, setTextSize } = useTheme();
  const { t, locale, setLocale } = useI18n();
  const [perms, setPerms] = useState<Awaited<ReturnType<typeof permissionStates>> | null>(null);

  // Re-read when coming back from the phone's settings.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      permissionStates().then((p) => active && setPerms(p));
      return () => {
        active = false;
      };
    }, []),
  );

  const rows = [
    { key: 'location', icon: MapPin, label: 'settings.location' },
    { key: 'camera', icon: Camera, label: 'settings.camera' },
    { key: 'notifications', icon: Bell, label: 'settings.notifications' },
  ] as const;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScreenHeader title={t('account.settings')} />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          title={t('account.language')}
          options={(
            [
              { value: 'ar', label: 'العربية' },
              { value: 'en', label: 'English' },
            ] as { value: Locale; label: string }[]
          ).map((l) => ({ key: l.value, label: l.label, selected: l.value === locale }))}
          onSelect={(key) => setLocale(key as Locale)}
        />
        <Segmented
          title={t('account.theme')}
          options={THEMES.map((th) => ({ key: th.mode, label: t(th.label), selected: th.mode === mode }))}
          onSelect={(key) => void setMode(key as ThemeMode)}
        />
        <Segmented
          title={t('account.textSize')}
          options={SIZES.map((s) => ({ key: s.size, label: t(s.label), selected: s.size === textSize }))}
          onSelect={(key) => void setTextSize(key as TextSize)}
        />

        <NotificationSwitches />

        <View style={styles.group}>
          <AppText variant="small" tone="secondary" accessibilityRole="header">
            {t('settings.permissions')}
          </AppText>
          <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
            {rows.map(({ key, icon: Icon, label }, i) => (
              <View
                key={key}
                accessible
                style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }]}
              >
                <Icon size={20} color={colors.brand.primary} />
                <AppText style={styles.flex}>{t(label)}</AppText>
                <AppText variant="small" tone="secondary">
                  {perms ? t(STATE_LABEL[perms[key]]) : '–'}
                </AppText>
              </View>
            ))}
          </View>
          <Button variant="text" label={t('settings.openSettings')} onPress={() => void Linking.openSettings()} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Signed-in people choose which notifications also alert the phone. */
function NotificationSwitches() {
  const { colors } = useTheme();
  const { t } = useI18n();
  const { state } = useAuth();
  const { query, update } = useNotificationPreferences();
  if (state.status !== 'signedIn' || !query.data) return null;
  const rows = [
    { key: 'report_updates', label: 'settings.push.reports', hint: 'settings.push.reportsHint' },
    { key: 'donation_updates', label: 'settings.push.donations', hint: 'settings.push.donationsHint' },
  ] as const;
  return (
    <View style={styles.group}>
      <AppText variant="small" tone="secondary" accessibilityRole="header">
        {t('settings.notifications')}
      </AppText>
      <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
        {rows.map(({ key, label, hint }, i) => (
          <View key={key} style={[styles.switchRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.border.default }]}>
            <View style={styles.flex}>
              <AppText>{t(label)}</AppText>
              <AppText variant="small" tone="secondary">
                {t(hint)}
              </AppText>
            </View>
            <Switch
              accessibilityLabel={t(label)}
              value={query.data[key]}
              onValueChange={(on) => update.mutate({ [key]: on })}
              trackColor={{ true: colors.brand.primary, false: colors.border.strong }}
              thumbColor={colors.bg.surface}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: space[7], gap: space[7] },
  group: { gap: space[3] },
  card: { borderWidth: 1, borderRadius: radius.lg + 2, overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: space[5], flexDirection: 'row', alignItems: 'center', gap: space[4] },
  switchRow: { minHeight: 64, paddingHorizontal: space[5], paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[4] },
});
