import { space } from '@hufra/brand';
import { legalResponseSchema, meResponseSchema } from '@hufra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { useApi } from '@/api/api-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { openWebsite } from './website';

/**
 * Plan 8.4c: after a material change to the legal pages, a signed-in person is
 * asked to accept the new version before using the app. Offline, signed out or
 * a server error never blocks: only a clear "accepted an older version" does.
 */
export function useLegalCheck() {
  const { api } = useApi();
  const { state } = useAuth();
  const userId = state.status === 'signedIn' ? state.user.id : 0;
  return useQuery({
    queryKey: ['legal-check', userId],
    // id 0: signed in while offline at start, the server was not asked who this is.
    enabled: userId > 0,
    staleTime: 60 * 60 * 1000,
    retry: false,
    queryFn: async ({ signal }) => {
      const [legal, me] = await Promise.all([
        api.request('/api/site/legal', { schema: legalResponseSchema, auth: false, signal }),
        api.request('/api/auth/me', { schema: meResponseSchema, signal }),
      ]);
      const accepted = me.user.legal_version_accepted ?? 0;
      return { version: legal.version, required: legal.acceptance_required_from > 0 && accepted < legal.acceptance_required_from };
    },
  });
}

export function LegalGate({ children }: { children: ReactNode }) {
  const check = useLegalCheck();
  if (check.data?.required) return <AcceptLegal version={check.data.version} />;
  return <>{children}</>;
}

export function AcceptLegal({ version }: { version: number }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { api } = useApi();
  const { signOut } = useAuth();
  const queryClient = useQueryClient();
  const accept = useMutation({
    mutationFn: () => api.request('/api/auth/me/accept-legal', { method: 'POST', body: { version }, schema: z.unknown() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['legal-check'] }),
  });

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="title2" accessibilityRole="header">
          {t('legal.title')}
        </AppText>
        <AppText tone="secondary">{t('legal.body')}</AppText>
        <View style={styles.links}>
          <Button variant="text" accessibilityRole="link" label={t('legal.privacy')} onPress={() => openWebsite(locale, '/privacy')} />
          <Button variant="text" accessibilityRole="link" label={t('legal.terms')} onPress={() => openWebsite(locale, '/terms')} />
          <Button variant="text" accessibilityRole="link" label={t('legal.donationRules')} onPress={() => openWebsite(locale, '/donation-rules')} />
        </View>
        {accept.isError ? (
          <AppText accessibilityRole="alert" style={{ color: colors.feedback.dangerFg }}>
            {t('legal.failed')}
          </AppText>
        ) : null}
        <Button label={t('legal.accept')} disabled={accept.isPending} onPress={() => accept.mutate()} />
        <AppText variant="caption" tone="secondary">
          {t('legal.decline')}
        </AppText>
        <Button variant="secondary" label={t('account.signOut')} onPress={() => void signOut()} />
        <Button variant="text" accessibilityRole="link" label={t('legal.deleteHow')} onPress={() => openWebsite(locale, '/delete-account')} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', padding: space[8], gap: space[5] },
  links: { alignItems: 'flex-start' },
});
