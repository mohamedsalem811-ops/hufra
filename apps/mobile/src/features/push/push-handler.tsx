import { useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { useApi } from '@/api/api-provider';
import { useI18n } from '@/i18n/i18n-provider';
import { secureStore } from '@/storage/secure';

import { useAuth } from '../auth/auth-provider';
import { ensureAndroidChannel, registerForPush, targetFor } from './push';

// While the app is open, still show the banner (the inbox updates too).
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/**
 * Push notifications (plan 6.7). Renders nothing. Registers this phone for
 * the signed-in person (again after a new token, language change, or when
 * notifications are allowed later in Settings), refreshes data when one
 * arrives, and opens the right screen when one is tapped, also from a cold start.
 */
export function PushHandler() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { api } = useApi();
  const { state } = useAuth();
  const { t, locale } = useI18n();
  const userId = state.status === 'signedIn' && state.user.id > 0 ? state.user.id : null;
  const channelName = t('push.channel');

  useEffect(() => {
    void ensureAndroidChannel(channelName);
  }, [channelName]);

  useEffect(() => {
    if (userId === null) return;
    const register = (token?: string) => void registerForPush(api, secureStore, { userId, locale, token });
    register();
    const tokenSub = Notifications.addPushTokenListener((t) => register(String(t.data)));
    const appSub = AppState.addEventListener('change', (s) => s === 'active' && register());
    return () => {
      tokenSub.remove();
      appSub.remove();
    };
  }, [api, userId, locale]);

  useEffect(() => {
    const refresh = () => {
      for (const queryKey of [['notifications'], ['my-reports'], ['pothole'], ['home']]) {
        void queryClient.invalidateQueries({ queryKey });
      }
    };
    const open = (response: Notifications.NotificationResponse) => {
      refresh();
      router.push(targetFor(response.notification.request.content.data));
      Notifications.clearLastNotificationResponse();
    };
    // Tapped while the app was closed: open it once the navigator has mounted.
    const last = Notifications.getLastNotificationResponse();
    const timer = last ? setTimeout(() => open(last), 0) : undefined;
    const received = Notifications.addNotificationReceivedListener(refresh);
    const tapped = Notifications.addNotificationResponseReceivedListener(open);
    return () => {
      clearTimeout(timer);
      received.remove();
      tapped.remove();
    };
  }, [router, queryClient]);

  return null;
}
