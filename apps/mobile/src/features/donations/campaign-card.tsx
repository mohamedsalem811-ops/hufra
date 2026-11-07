import { radius, space } from '@hufra/brand';
import type { CampaignSummary } from '@hufra/contracts';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { HandHeart } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { mediaUrl } from '../reports/format';

import { barParts, formatLyd } from './money';
import { useDonationConfig, useOpenDonationPage, usePotholeCampaign } from './use-donations';

/**
 * Repair campaign on a report (design board 9, screen 1). Only money the team
 * confirmed moves the bar; money under review is shown apart and never
 * counted. "Donate" opens the website (in-app browser or Safari, as the team
 * set it), where the donation itself happens.
 */
export function CampaignCard({ potholeId }: { potholeId: number }) {
  const query = usePotholeCampaign(potholeId);
  const campaign = query.data?.campaign;
  if (!campaign) return null;
  return <CampaignCardView campaign={campaign} />;
}

export function CampaignCardView({ campaign: c }: { campaign: CampaignSummary }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const config = useDonationConfig();
  const { open, opening } = useOpenDonationPage();
  const parts = barParts(c.target_lyd, c.confirmed_lyd, c.under_review_lyd);
  const left = Math.max(0, c.target_lyd - c.confirmed_lyd);
  const note = (locale === 'ar' ? c.note_ar ?? c.note_en : c.note_en ?? c.note_ar) || t('campaign.use');
  const closed =
    c.status === 'funded' ? t('campaign.funded') : c.status === 'completed' ? t('campaign.completed') : c.status === 'cancelled' ? t('campaign.cancelled') : null;
  const donors = c.donors_count === 1 ? t('campaign.donor1') : t('campaign.donors', { n: c.donors_count });

  return (
    <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
      <View style={styles.head}>
        <HandHeart size={20} color={colors.brand.primary} />
        <AppText variant="title3" accessibilityRole="header">
          {t('campaign.title')}
        </AppText>
      </View>
      <AppText variant="bodyStrong">{t('campaign.of', { a: formatLyd(c.confirmed_lyd, locale), b: formatLyd(c.target_lyd, locale) })}</AppText>
      <View
        style={[styles.bar, { backgroundColor: colors.bg.subtle }]}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t('campaign.of', { a: formatLyd(c.confirmed_lyd, locale), b: formatLyd(c.target_lyd, locale) })}
        accessibilityValue={{ min: 0, max: 100, now: Math.round(parts.confirmed) }}
      >
        <View style={{ width: `${parts.confirmed}%`, backgroundColor: colors.status.fixed.pin }} />
        <View style={{ width: `${parts.underReview}%`, backgroundColor: colors.status.underRepair.pin, opacity: 0.6 }} />
      </View>
      <View style={styles.legend}>
        <Legend color={colors.status.fixed.pin} text={t('campaign.confirmed', { a: formatLyd(c.confirmed_lyd, locale) })} />
        {c.under_review_lyd > 0 ? (
          <Legend color={colors.status.underRepair.pin} text={t('campaign.review', { a: formatLyd(c.under_review_lyd, locale) })} />
        ) : null}
      </View>
      <AppText variant="small" tone="secondary">
        {c.status === 'active' && left > 0 ? `${donors} · ${t('campaign.left', { a: formatLyd(left, locale) })}` : donors}
      </AppText>
      <AppText variant="small" tone="secondary">
        {note}
      </AppText>
      <CostDetails campaign={c} />
      {closed ? (
        <View style={[styles.notice, { backgroundColor: colors.status.fixed.bg }]}>
          <AppText variant="small" style={{ color: colors.status.fixed.fg }}>
            {closed}
          </AppText>
        </View>
      ) : config.data && !config.data.enabled ? (
        <AppText variant="small" tone="secondary">
          {t('campaign.notOpen')}
        </AppText>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: opening, disabled: opening }}
          disabled={opening}
          onPress={() => void open(`/donate/${c.id}`)}
          style={({ pressed }) => [styles.donate, { backgroundColor: pressed ? colors.action.primaryPressed : colors.action.primary }]}
        >
          {opening ? <ActivityIndicator color={colors.action.onPrimary} /> : null}
          <AppText variant="bodyStrong" style={[fontFor(700), { color: colors.action.onPrimary }]}>
            {t('campaign.donate')}
          </AppText>
        </Pressable>
      )}
    </View>
  );
}

/** Plan 8.2: the repair cost line by line, then the final cost and receipt once repaired. */
function CostDetails({ campaign: c }: { campaign: CampaignSummary }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const receipt = mediaUrl(c.receipt_key);
  if (!c.cost_items.length && c.final_cost_lyd === null && !receipt) return null;
  return (
    <View style={[styles.costs, { borderColor: colors.border.default }]}>
      {c.cost_items.length ? (
        <>
          <AppText variant="bodyStrong" accessibilityRole="header">
            {t('campaign.costs')}
          </AppText>
          {c.cost_items.map((item, i) => (
            <View key={i} style={styles.costRow}>
              <AppText variant="small" style={styles.flex}>
                {item.label}
              </AppText>
              <AppText variant="small" style={fontFor(600)}>
                {formatLyd(item.amount_lyd, locale)}
              </AppText>
            </View>
          ))}
        </>
      ) : null}
      {c.final_cost_lyd !== null ? <AppText variant="bodyStrong">{t('campaign.finalCost', { a: formatLyd(c.final_cost_lyd, locale) })}</AppText> : null}
      {receipt ? (
        <Pressable accessibilityRole="imagebutton" accessibilityLabel={t('campaign.receiptOpen')} onPress={() => void WebBrowser.openBrowserAsync(receipt)}>
          <Image source={receipt} style={[styles.receipt, { backgroundColor: colors.bg.subtle }]} contentFit="cover" accessible={false} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Legend({ color, text }: { color: string; text: string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <AppText variant="small" style={styles.flex}>
        {text}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: radius.xl, padding: space[6], gap: space[4] },
  head: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  bar: { height: 12, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row' },
  legend: { gap: space[2] },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  dot: { width: 10, height: 10, borderRadius: 3 },
  flex: { flex: 1 },
  notice: { borderRadius: radius.lg, padding: space[4] },
  costs: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4], gap: space[2] },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  receipt: { width: 120, height: 90, borderRadius: radius.md },
  donate: { minHeight: 56, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[3] },
});
