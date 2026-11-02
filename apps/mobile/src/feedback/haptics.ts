import * as Haptics from 'expo-haptics';

/**
 * Small, meaningful vibrations (plan 6.8), never decoration: a choice was made,
 * something succeeded, something needs attention. The phone's own "touch
 * feedback" setting still applies, and failures are ignored.
 */
export const haptic = {
  select: () => void Haptics.selectionAsync().catch(() => undefined),
  success: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined),
  warning: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined),
  error: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined),
};
