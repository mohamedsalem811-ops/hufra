import { radius, space } from '@hufra/brand';
import { User } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useAuth } from '@/features/auth/auth-provider';
import { useI18n } from '@/i18n/i18n-provider';
import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages';
import type { ThemeMode } from '@/theme/theme';
import { useTheme } from '@/theme/theme-provider';

import { TabPlaceholder } from './tab-placeholder';

const THEMES: { mode: ThemeMode; label: MessageKey }[] = [
  { mode: 'system', label: 'account.theme.system' },
  { mode: 'light', label: 'account.theme.light' },
  { mode: 'dark', label: 'account.theme.dark' },
];

/** Account tab for now: just language and appearance, so both can be tested on a phone. */
export function AccountPlaceholder() {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();
  const languages: { value: Locale; label: string }[] = [
    { value: 'ar', label: 'العربية' },
    { value: 'en', label: 'English' },
  ];
  return (
    <TabPlaceholder icon={User} title="tabs.account">
      <Session />
      <Segmented
        title={t('account.language')}
        options={languages.map((l) => ({ key: l.value, label: l.label, selected: l.value === locale }))}
        onSelect={(key) => setLocale(key as Locale)}
      />
      <Segmented
        title={t('account.theme')}
        options={THEMES.map((th) => ({ key: th.mode, label: t(th.label), selected: th.mode === mode }))}
        onSelect={(key) => setMode(key as ThemeMode)}
      />
    </TabPlaceholder>
  );
}

function Session() {
  const { t } = useI18n();
  const router = useRouter();
  const { state, signOut } = useAuth();
  if (state.status === 'loading') return null;
  if (state.status === 'signedIn') {
    return (
      <View style={styles.group}>
        {state.user.email ? (
          <AppText variant="small" tone="secondary">
            {t('account.signedInAs', { email: state.user.email })}
          </AppText>
        ) : null}
        <Button variant="secondary" label={t('account.signOut')} onPress={signOut} />
      </View>
    );
  }
  return (
    <View style={styles.group}>
      <AppText variant="small" tone="secondary">
        {t('account.signedOutHint')}
      </AppText>
      <Button label={t('auth.signIn.title')} onPress={() => router.push('/auth/sign-in')} />
      <Button variant="text" label={t('auth.createAccount')} onPress={() => router.push('/auth/sign-up')} />
    </View>
  );
}

function Segmented({
  title,
  options,
  onSelect,
}: {
  title: string;
  options: { key: string; label: string; selected: boolean }[];
  onSelect: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="small" tone="secondary">
        {title}
      </AppText>
      <View accessibilityRole="radiogroup" style={[styles.segmented, { backgroundColor: colors.bg.subtle }]}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: o.selected }}
            onPress={() => onSelect(o.key)}
            style={[styles.option, o.selected && { backgroundColor: colors.bg.surface }]}
          >
            <AppText variant={o.selected ? 'bodyStrong' : 'body'} tone={o.selected ? 'primary' : 'secondary'}>
              {o.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  segmented: { flexDirection: 'row', borderRadius: radius.md + 2, padding: space[2] },
  option: { flex: 1, minHeight: 44, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center' },
});
