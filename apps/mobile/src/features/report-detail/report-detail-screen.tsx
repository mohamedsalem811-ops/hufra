import { radius, shadowColor, space } from '@hufra/brand';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight, Share2 } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { ErrorView } from '@/components/error-view';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { placeName } from '../reports/format';
import { SEVERITY_LABEL } from '../reports/status';
import { StatusBadge } from '../reports/status-badge';
import { BeforeAfter } from './before-after';
import { ConfirmBar } from './confirm-bar';
import { LocationCard } from './location-card';
import { beforeAfterPair, daysBetween, daysText, galleryPhotos, shareUrl, timeline } from './model';
import { HERO_HEIGHT, PhotoGallery } from './photo-gallery';
import { StatusTimeline } from './status-timeline';
import { useConfirmReport, useReportDetail } from './use-report-detail';

/** Report detail (design board 4, screens 1 and 2; plan 6.4). */
export function ReportDetailScreen({ id }: { id: number }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const { state } = useAuth();
  const query = useReportDetail(id);
  const confirm = useConfirmReport(id);
  const data = query.data;

  const view = useMemo(() => {
    if (!data) return null;
    const p = data.pothole;
    const place = placeName(p, locale);
    const age = daysBetween(p.created_at, new Date().toISOString());
    const description = (locale === 'ar' ? p.description_ar ?? p.description_en : p.description_en ?? p.description_ar)?.trim();
    const measures = (
      [
        ['detail.length', p.length_cm],
        ['detail.width', p.width_cm],
        ['detail.depth', p.depth_cm],
      ] as [MessageKey, number | null][]
    ).filter((m): m is [MessageKey, number] => m[1] !== null && m[1] > 0);
    return {
      p,
      place,
      ago: age === 0 ? t('detail.today') : t('detail.ago', { days: daysText(age, locale) }),
      fixedDays: p.status === 'fixed' && p.fixed_at ? daysBetween(p.created_at, p.fixed_at) : null,
      description: description || null,
      measures,
      pair: beforeAfterPair(data.photos),
      gallery: galleryPhotos(data.photos),
      entries: timeline(data),
    };
  }, [data, locale, t]);

  const Back = isRTL ? ChevronRight : ChevronLeft;
  const floatTop = insets.top + space[3];

  const header = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('detail.back')}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={[styles.float, styles.floatStart, { top: floatTop, backgroundColor: colors.bg.surface }]}
      >
        <Back size={22} color={colors.text.primary} />
      </Pressable>
      {view ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('detail.share')}
          onPress={() => {
            const place = view.place.street ? `${view.place.street}، ${view.place.area}` : view.place.area;
            const url = shareUrl(id);
            void Share.share({ message: t('detail.shareMessage', { place, url }), url }).catch(() => undefined);
          }}
          style={[styles.float, styles.floatEnd, { top: floatTop, backgroundColor: colors.bg.surface }]}
        >
          <Share2 size={20} color={colors.text.primary} />
        </Pressable>
      ) : null}
    </>
  );

  if (query.isError && !data) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
        <ErrorView error={query.error} onRetry={() => query.refetch()} />
        {header}
      </View>
    );
  }

  if (!view) {
    return (
      <View style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
        <View style={{ height: HERO_HEIGHT, backgroundColor: colors.bg.subtle }} />
        <ActivityIndicator style={styles.loading} color={colors.brand.primary} accessibilityLabel={t('map.loading')} />
        {header}
      </View>
    );
  }

  const { p } = view;
  const mine = data?.viewer?.mine ?? false;
  const showConfirm = p.status !== 'fixed' && !mine;

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: showConfirm ? space[7] : insets.bottom + space[9] }}>
        {view.pair ? (
          <BeforeAfter before={view.pair.before} after={view.pair.after} height={HERO_HEIGHT + 20} />
        ) : (
          <PhotoGallery photos={view.gallery} />
        )}

        <View style={styles.body}>
          <View style={styles.badges}>
            <StatusBadge status={p.status} />
            {mine ? (
              <View style={[styles.pill, { backgroundColor: colors.bg.brandTint }]}>
                <AppText variant="caption" style={[fontFor(600), { color: colors.brand.primary }]}>
                  {t('detail.yours')}
                </AppText>
              </View>
            ) : null}
            <AppText variant="caption" tone="secondary" accessibilityLabel={t('detail.number', { id: p.id })} style={styles.ltr}>
              #{p.id}
            </AppText>
          </View>

          <AppText variant="title2" accessibilityRole="header">
            {view.place.street ?? t('map.unknownStreet')}
          </AppText>
          <AppText tone="secondary">
            {view.place.area} · {t('detail.severity', { level: t(SEVERITY_LABEL[p.severity]) })} · {view.ago}
          </AppText>

          {view.fixedDays !== null ? (
            <View style={[styles.fixedBanner, { backgroundColor: colors.status.fixed.bg }]}>
              <AppText variant="bodyStrong" style={{ color: colors.status.fixed.fg }}>
                {view.fixedDays === 0
                  ? t('detail.fixedSameDay')
                  : t('detail.fixedIn', { days: daysText(view.fixedDays, locale) })}
              </AppText>
            </View>
          ) : null}

          {view.description ? <AppText style={styles.description}>{view.description}</AppText> : null}

          {view.measures.length ? (
            <View style={styles.measures}>
              {view.measures.map(([label, value]) => (
                <View
                  key={label}
                  accessible
                  style={[styles.measure, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}
                >
                  <AppText variant="small" tone="secondary">
                    {t(label)}
                  </AppText>
                  <AppText variant="title3">{t('detail.cm', { n: value })}</AppText>
                </View>
              ))}
            </View>
          ) : null}

          <LocationCard
            lat={p.lat}
            lng={p.lng}
            status={p.status}
            label={view.place.street ?? view.place.area}
            onOpenMap={() =>
              router.navigate({ pathname: '/map', params: { focus: String(p.id), lat: String(p.lat), lng: String(p.lng) } })
            }
          />

          {!showConfirm && p.upvotes_count > 0 ? (
            <AppText variant="small" tone="secondary">
              {t('detail.confirmedBy', { n: p.upvotes_count })}
            </AppText>
          ) : null}

          <StatusTimeline entries={view.entries} />
        </View>
      </ScrollView>

      {showConfirm ? (
        <ConfirmBar
          count={p.upvotes_count}
          confirmed={data?.viewer?.upvoted ?? false}
          signedIn={state.status === 'signedIn'}
          pending={confirm.isPending}
          error={confirm.error}
          onConfirm={() => confirm.mutate()}
          onSignIn={() => router.push('/auth/sign-in')}
        />
      ) : null}
      {header}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: { marginTop: space[9] },
  float: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  floatStart: { start: space[5] },
  floatEnd: { end: space[5] },
  body: { padding: space[7], gap: space[5] },
  badges: { flexDirection: 'row', alignItems: 'center', gap: space[3], flexWrap: 'wrap' },
  pill: { paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.pill },
  ltr: { writingDirection: 'ltr' },
  fixedBanner: { borderRadius: radius.lg, paddingHorizontal: space[5], paddingVertical: space[4] },
  description: { lineHeight: 28 },
  measures: { flexDirection: 'row', gap: space[3] },
  measure: { flex: 1, borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[1] },
});
