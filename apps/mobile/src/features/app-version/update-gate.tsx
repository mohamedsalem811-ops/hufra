import { space } from '@hufra/brand';
import { appVersionResponseSchema } from '@hufra/contracts';
import { useQuery } from '@tanstack/react-query';
import Constants from 'expo-constants';
import type { ReactNode } from 'react';
import { Linking, Platform, StyleSheet, View } from 'react-native';

import { useApi } from '@/api/api-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

/** The version this build was made as (app.json "version"). */
export function installedVersion(): string {
  return Constants.expoConfig?.version ?? '1.0.0';
}

/**
 * Asks the server whether this version is still allowed (plan 7.1).
 * Offline or a server error never blocks the app: only a clear "update required" does.
 */
export function useAppVersion() {
  const { api } = useApi();
  const platform = Platform.OS === 'ios' ? 'ios' : 'android';
  const version = installedVersion();
  return useQuery({
    queryKey: ['app-version', platform, version],
    enabled: Platform.OS === 'ios' || Platform.OS === 'android',
    staleTime: 6 * 60 * 60 * 1000,
    retry: false,
    queryFn: ({ signal }) =>
      api.request(`/api/app/version?platform=${platform}&version=${encodeURIComponent(version)}`, {
        schema: appVersionResponseSchema,
        signal,
      }),
  });
}

/** Shows the app, or a full screen asking to update when this version is too old. */
export function UpdateGate({ children }: { children: ReactNode }) {
  const check = useAppVersion();
  if (check.data?.update_required) return <UpdateRequired storeUrl={check.data.store_url} />;
  return <>{children}</>;
}

export function UpdateRequired({ storeUrl }: { storeUrl: string | null }) {
  const { t } = useI18n();
  const { colors } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: colors.bg.canvas }]} accessibilityRole="alert">
      <AppText variant="title2" style={styles.center}>
        {t('update.title')}
      </AppText>
      <AppText tone="secondary" style={styles.center}>
        {t('update.body')}
      </AppText>
      {storeUrl ? <Button label={t('update.action')} onPress={() => void Linking.openURL(storeUrl)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[5], padding: space[8] },
  center: { textAlign: 'center' },
});
