import { myPotholesResponseSchema, notificationListResponseSchema, type NotificationListResponse } from '@hufra/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { z } from 'zod';

import { useApi } from '@/api/api-provider';

import { useAuth } from '../auth/auth-provider';
import { useOutbox } from '../outbox/outbox-provider';

function useUserId(): number | null {
  const { state } = useAuth();
  return state.status === 'signedIn' ? state.user.id : null;
}

/** The person's sent reports (newest first), with their first photo. */
export function useMyReports() {
  const { api } = useApi();
  const userId = useUserId();
  return useQuery({
    queryKey: ['my-reports', userId],
    enabled: userId !== null,
    queryFn: ({ signal }) => api.request('/api/potholes/mine/list', { schema: myPotholesResponseSchema, signal }),
  });
}

/** Inbox, newest first, with the unread count for the badge. */
export function useNotifications() {
  const { api } = useApi();
  const userId = useUserId();
  return useQuery({
    queryKey: ['notifications', userId],
    enabled: userId !== null,
    queryFn: ({ signal }) => api.request('/api/notifications', { schema: notificationListResponseSchema, signal }),
  });
}

export function useMarkAllRead() {
  const { api } = useApi();
  const userId = useUserId();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => api.request('/api/notifications/read-all', { method: 'POST', schema: z.unknown() }),
    onSuccess: () => {
      const now = new Date().toISOString();
      queryClient.setQueryData<NotificationListResponse>(['notifications', userId], (old) =>
        old ? { unread_count: 0, results: old.results.map((n) => ({ ...n, read_at: n.read_at ?? now })) } : old,
      );
    },
  });
}

/**
 * "Download a copy of my data": the server's export, saved as a JSON file in
 * the app's cache and handed to the share sheet (save to Files, send, ...).
 */
export function useExportData() {
  const { api } = useApi();
  return useMutation({
    mutationFn: async () => {
      const data = await api.request('/api/auth/me/export', { schema: z.unknown() });
      const file = new File(Paths.cache, `hufra-my-data-${new Date().toISOString().slice(0, 10)}.json`);
      if (file.exists) file.delete();
      file.create();
      file.write(JSON.stringify(data, null, 2));
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
    },
  });
}

/**
 * Delete the account on the server, then everything personal on the phone:
 * the session, cached personal data and reports still waiting to be sent.
 */
export function useDeleteAccount() {
  const { api } = useApi();
  const { signOut } = useAuth();
  const outbox = useOutbox();
  return useMutation({
    mutationFn: async () => {
      await api.request('/api/auth/me/delete', { method: 'POST', schema: z.unknown() });
      await Promise.allSettled(outbox.items.map((item) => outbox.remove(item.uuid)));
      await signOut({ remote: false });
    },
  });
}

/** Title, body and the report it is about, from a notification's stored copy. */
export function readNotification(payloadJson: string, locale: 'ar' | 'en') {
  let p: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(payloadJson);
    if (parsed && typeof parsed === 'object') p = parsed as Record<string, unknown>;
  } catch {
    // Unreadable payload: shown with the generic copy below.
  }
  const text = (key: string) => (typeof p[key] === 'string' ? (p[key] as string).trim() : '');
  const title = text(`title_${locale}`) || text(locale === 'ar' ? 'title_en' : 'title_ar');
  const body = text(`body_${locale}`) || text(locale === 'ar' ? 'body_en' : 'body_ar');
  const id = Number(p.pothole_id);
  return { title, body, potholeId: Number.isInteger(id) && id > 0 ? id : null };
}
