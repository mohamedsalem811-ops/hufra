import type { ColorTheme } from '@hufra/brand';
import type { PotholeStatus, Severity } from '@hufra/contracts';

import type { MessageKey } from '@/i18n/messages';

type StatusKey = keyof ColorTheme['status'];

const THEME_KEY: Record<PotholeStatus, StatusKey> = {
  reported: 'reported',
  verified: 'verified',
  under_repair: 'underRepair',
  fixed: 'fixed',
};

/** Pin, text and badge colours for a status (brand tokens; text pairs pass WCAG AA). */
export function statusColors(colors: ColorTheme, status: PotholeStatus) {
  return colors.status[THEME_KEY[status]];
}

export const STATUS_LABEL: Record<PotholeStatus, MessageKey> = {
  reported: 'status.reported',
  verified: 'status.verified',
  under_repair: 'status.underRepair',
  fixed: 'status.fixed',
};

export const SEVERITY_LABEL: Record<Severity, MessageKey> = {
  minor: 'severity.minor',
  medium: 'severity.medium',
  severe: 'severity.severe',
};
