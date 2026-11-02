import type { Notification } from '@hufra/contracts';

import type { Locale } from '@/i18n/locale';
import type { MessageKey } from '@/i18n/messages';

import { formatDate } from '../reports/format';

export type InboxGroup = 'today' | 'week' | 'earlier';
export const GROUP_LABEL: Record<InboxGroup, MessageKey> = {
  today: 'notifications.today',
  week: 'notifications.week',
  earlier: 'notifications.earlier',
};

const DAY = 24 * 60 * 60 * 1000;

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Today / this week (last 7 days) / earlier, in local time, keeping the server's newest-first order. */
export function groupInbox(items: readonly Notification[], now = new Date()): { group: InboxGroup; items: Notification[] }[] {
  const today = startOfDay(now);
  const groups: Record<InboxGroup, Notification[]> = { today: [], week: [], earlier: [] };
  for (const n of items) {
    const at = Date.parse(n.created_at);
    const g: InboxGroup = at >= today ? 'today' : at >= today - 6 * DAY ? 'week' : 'earlier';
    groups[g].push(n);
  }
  return (['today', 'week', 'earlier'] as const).filter((g) => groups[g].length).map((g) => ({ group: g, items: groups[g] }));
}

/** "الآن", "قبل 5 دقيقة", "قبل 3 ساعة" today; a weekday this week; a date before. */
export function inboxTime(
  iso: string,
  locale: Locale,
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  now = new Date(),
): string {
  const at = new Date(iso);
  const diff = now.getTime() - at.getTime();
  if (!Number.isFinite(diff)) return '';
  if (at.getTime() >= startOfDay(now)) {
    if (diff < 60_000) return t('time.justNow');
    if (diff < 3_600_000) return t('time.minutes', { n: Math.floor(diff / 60_000) });
    return t('time.hours', { n: Math.floor(diff / 3_600_000) });
  }
  if (at.getTime() >= startOfDay(now) - 6 * DAY) {
    try {
      return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { weekday: 'long' }).format(at);
    } catch {
      return formatDate(iso, locale);
    }
  }
  return formatDate(iso, locale);
}
