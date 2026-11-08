import { radius, space } from '@hufra/brand';
import type { PublicPartner, PublicPotholeListItem, RecentFixedResponse } from '@hufra/contracts';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Bell, ChevronLeft, ChevronRight, HandHeart, ImageOff, MapPin, Trophy } from 'lucide-react-native';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { errorMessageKey } from '@/components/error-view';
import { API_URL } from '@/config/env';
import { useI18n } from '@/i18n/i18n-provider';
import { currentPosition, hasLocationPermission, requestLocation, type Coordinates } from '@/permissions/permissions';
import { brandAssets } from '@/theme/brand-assets';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { useNotifications } from '../account/use-account';
import { useAuth } from '../auth/auth-provider';
import { daysText } from '../report-detail/model';
import { mediaUrl, placeName } from '../reports/format';
import { SEVERITY_LABEL } from '../reports/status';
import { StatusBadge } from '../reports/status-badge';
import { cityNumbers, formatDistance, formatLyd, nearbyOpen } from './home-logic';
import { useHomeData, useNearby } from './use-home';

type Place = 'unknown' | 'locating' | 'denied' | 'ready';

/** Home (design board 2, screen 1; plan 6.5). Each block loads on its own and has its own empty state. */
export function HomeScreen() {
  const router = useRouter();
  const { colors, scheme } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const { state } = useAuth();
  const home = useHomeData();
  const inbox = useNotifications();
  const unread = inbox.data?.unread_count ?? 0;
  const [position, setPosition] = useState<Coordinates | null>(null);
  const [place, setPlace] = useState<Place>('unknown');
  const nearby = useNearby(position);

  const locate = useCallback(async (ask: boolean) => {
    const allowed = ask ? (await requestLocation()) === 'granted' : await hasLocationPermission();
    if (!allowed) return setPlace('denied');
    setPlace('locating');
    const pos = await currentPosition();
    setPosition(pos);
    setPlace(pos ? 'ready' : 'denied');
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void locate(false), 0);
    return () => clearTimeout(timer);
  }, [locate]);

  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await Promise.allSettled([
      home.counters.refetch(),
      home.recentFixed.refetch(),
      home.topReporter.refetch(),
      home.topDonor.refetch(),
      home.partners.refetch(),
      position ? nearby.refetch() : Promise.resolve(),
    ]);
    setRefreshing(false);
  }

  const name = state.status === 'signedIn' ? state.user.display_name?.trim() : null;
  const numbers = cityNumbers(home.counters.data);
  const avg = home.counters.data?.avg_response_days;
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  const openReport = (id: number) => router.push({ pathname: '/pothole/[id]', params: { id: String(id) } });

  return (
    <SafeAreaView edges={['top']} style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand.primary} />}
      >
        <View style={styles.top}>
          <Image
            source={scheme === 'dark' ? brandAssets.lockupHorizontalOnDark : brandAssets.lockupHorizontal}
            style={styles.logo}
            contentFit="contain"
            accessibilityLabel={t('app.name')}
          />
          {state.status === 'signedIn' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={unread ? `${t('notifications.title')}، ${t('account.unread', { n: unread })}` : t('notifications.title')}
              onPress={() => router.push('/notifications')}
              style={[styles.bell, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}
            >
              <Bell size={22} color={colors.text.primary} />
              {unread ? <View style={[styles.bellDot, { backgroundColor: colors.action.primary, borderColor: colors.bg.surface }]} /> : null}
            </Pressable>
          ) : null}
        </View>
        <AppText variant="title2" accessibilityRole="header">
          {name ? t('home.helloName', { name }) : t('home.hello')}
        </AppText>

        {/* City numbers */}
        <View style={[styles.city, { backgroundColor: colors.brand.primary }]}>
          <AppText variant="small" style={{ color: colors.brand.onPrimary, opacity: 0.85 }}>
            {t('home.city')}
          </AppText>
          {home.counters.isError && !home.counters.data ? (
            <Inline error={home.counters.error} onRetry={() => home.counters.refetch()} onBrand />
          ) : (
            <View style={styles.numbers}>
              {(
                [
                  ['home.waiting', numbers.waiting],
                  ['home.underRepair', numbers.underRepair],
                  ['home.fixed', numbers.fixed],
                ] as const
              ).map(([label, value]) => (
                <View key={label} style={styles.number} accessible accessibilityLabel={`${t(label)}: ${value}`}>
                  <AppText variant="number" style={{ color: colors.brand.onPrimary }}>
                    {home.counters.data ? value : '–'}
                  </AppText>
                  <AppText variant="caption" style={{ color: colors.brand.onPrimary, opacity: 0.85 }}>
                    {t(label)}
                  </AppText>
                </View>
              ))}
            </View>
          )}
          {typeof avg === 'number' ? (
            <AppText variant="small" style={{ color: colors.brand.onPrimary }}>
              {t('home.avgDays', { days: daysText(Math.max(1, Math.round(avg)), locale) })}
            </AppText>
          ) : null}
          <Pressable
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(`${API_URL}/transparency`).catch(() => undefined)}
            hitSlop={8}
            style={styles.link}
          >
            <AppText variant="small" style={[fontFor(600), styles.underline, { color: colors.brand.onPrimary }]}>
              {t('home.transparency')}
            </AppText>
          </Pressable>
        </View>

        {/* Recently fixed */}
        <Section
          title={t('home.recentFixed')}
          action={{ label: t('home.seeAll'), onPress: () => router.navigate({ pathname: '/map', params: { status: 'fixed' } }) }}
        >
          {home.recentFixed.isError && !home.recentFixed.data ? (
            <Inline error={home.recentFixed.error} onRetry={() => home.recentFixed.refetch()} />
          ) : home.recentFixed.data && home.recentFixed.data.results.length === 0 ? (
            <Empty text={t('home.noFixed')} />
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.carousel}>
              {(home.recentFixed.data?.results ?? []).map((r) => (
                <FixedCard key={r.id} item={r} onPress={() => openReport(r.id)} />
              ))}
            </ScrollView>
          )}
        </Section>

        {/* Near you */}
        <Section title={t('home.nearYou')} action={{ label: t('home.onMap'), onPress: () => router.navigate('/map') }}>
          {place === 'denied' ? (
            <View style={[styles.card, styles.gap, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
              <AppText tone="secondary">{t('home.nearNeedsLocation')}</AppText>
              <Button variant="secondary" label={t('home.allowLocation')} onPress={() => void locate(true)} />
            </View>
          ) : place !== 'ready' || nearby.isPending ? (
            <Empty text={t('home.nearLocating')} />
          ) : nearby.isError && !nearby.data ? (
            <Inline error={nearby.error} onRetry={() => nearby.refetch()} />
          ) : nearbyOpen(nearby.data?.results ?? []).length === 0 ? (
            <View style={[styles.card, styles.gap, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
              <AppText tone="secondary">{t('home.nearNone')}</AppText>
              <Button label={t('home.reportOne')} onPress={() => router.push('/new-report')} />
            </View>
          ) : (
            nearbyOpen(nearby.data?.results ?? []).map((r) => (
              <NearbyRow key={r.id} item={r} onPress={() => openReport(r.id)} chevron={<Chevron size={20} color={colors.text.tertiary} />} />
            ))
          )}
        </Section>

        {/* People */}
        <Section title={t('home.people')}>
          <View style={styles.people}>
            <PersonCard
              icon={<Trophy size={20} color={colors.brand.primary} />}
              title={t('home.topReporter')}
              name={home.topReporter.data?.reporter?.name ?? null}
              detail={home.topReporter.data?.reporter ? t('home.reportCount', { n: home.topReporter.data.reporter.report_count }) : null}
              empty={t('home.topReporterNone')}
              loading={home.topReporter.isPending}
            />
            <PersonCard
              icon={<HandHeart size={20} color={colors.brand.primary} />}
              title={t('home.topDonor')}
              name={home.topDonor.data?.donor?.name ?? null}
              detail={home.topDonor.data?.donor ? formatLyd(home.topDonor.data.donor.amount_lyd, locale) : null}
              empty={t('home.topDonorNone')}
              loading={home.topDonor.isPending}
            />
          </View>
        </Section>

        {/* Partners (plan 8.2): shown only when the team chose "app home" for them. */}
        {home.partners.data?.results.length ? (
          <Section title={t('home.partners')}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.partners}>
              {home.partners.data.results.map((p) => (
                <PartnerCard key={p.id} partner={p} />
              ))}
            </ScrollView>
          </Section>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function PartnerCard({ partner: p }: { partner: PublicPartner }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const name = (locale === 'ar' ? p.name_ar || p.name_en : p.name_en || p.name_ar) ?? '';
  const logo = mediaUrl(p.logo_key);
  const body = (
    <View style={[styles.partner, { backgroundColor: colors.bg.surface, borderColor: p.featured ? colors.brand.primary : colors.border.default }]}>
      {logo ? (
        <Image source={logo} style={styles.partnerLogo} contentFit="contain" accessible={false} />
      ) : (
        <View style={[styles.partnerLogo, { backgroundColor: colors.bg.subtle }]} />
      )}
      <AppText variant="small" style={fontFor(600)} numberOfLines={2}>
        {name}
      </AppText>
      {p.funded_count > 0 ? (
        <AppText variant="caption" tone="secondary">
          {t('home.partnerFunded', { n: p.funded_count })}
        </AppText>
      ) : null}
    </View>
  );
  return p.website ? (
    <Pressable accessibilityRole="link" accessibilityLabel={name} onPress={() => void WebBrowser.openBrowserAsync(p.website)}>
      {body}
    </Pressable>
  ) : (
    <View accessible accessibilityLabel={name}>
      {body}
    </View>
  );
}

function Section({ title, action, children }: { title: string; action?: { label: string; onPress: () => void }; children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <AppText variant="title3" accessibilityRole="header">
          {title}
        </AppText>
        {action ? (
          <Pressable accessibilityRole="button" onPress={action.onPress} hitSlop={12} style={styles.link}>
            <AppText variant="small" style={[fontFor(600), { color: colors.text.link }]}>
              {action.label}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
      <AppText tone="secondary">{text}</AppText>
    </View>
  );
}

function Inline({ error, onRetry, onBrand }: { error: unknown; onRetry: () => void; onBrand?: boolean }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const color = onBrand ? colors.brand.onPrimary : colors.text.secondary;
  return (
    <View style={styles.inline} accessibilityRole="alert">
      <AppText variant="small" style={{ color }}>
        {t(errorMessageKey(error))}
      </AppText>
      <Pressable accessibilityRole="button" onPress={onRetry} hitSlop={12} style={styles.link}>
        <AppText variant="small" style={[fontFor(600), styles.underline, { color: onBrand ? color : colors.text.link }]}>
          {t('home.retry')}
        </AppText>
      </Pressable>
    </View>
  );
}

function Thumb({ uri, label, fixed }: { uri: string | null; label: string; fixed?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.thumb, { backgroundColor: fixed ? colors.status.fixed.bg : colors.bg.subtle }]}>
      {uri ? (
        <Image source={uri} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" accessible={false} />
      ) : (
        <ImageOff size={20} color={colors.text.tertiary} />
      )}
      <View style={[styles.stage, { backgroundColor: fixed ? '#146B43' : '#0E1B26' }]}>
        <AppText variant="caption" style={[fontFor(600), styles.white]}>
          {label}
        </AppText>
      </View>
    </View>
  );
}

function FixedCard({ item, onPress }: { item: RecentFixedResponse['results'][number]; onPress: () => void }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const p = placeName(item, locale);
  const title = p.street ? `${p.street}، ${p.area}` : p.area;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t('status.fixed')}، ${title}`}
      onPress={onPress}
      style={[styles.fixedCard, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}
    >
      <View style={styles.pair}>
        <Thumb uri={mediaUrl(item.before_thumb_key)} label={t('detail.before')} />
        <Thumb uri={mediaUrl(item.after_thumb_key)} label={t('detail.after')} fixed />
      </View>
      <View style={styles.row}>
        <AppText variant="bodyStrong" numberOfLines={1} style={styles.flex}>
          {title}
        </AppText>
        <StatusBadge status="fixed" />
      </View>
    </Pressable>
  );
}

function NearbyRow({ item, onPress, chevron }: { item: PublicPotholeListItem; onPress: () => void; chevron: ReactNode }) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const p = placeName(item, locale);
  const distance = item.distance_m !== undefined ? formatDistance(item.distance_m, locale) : null;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        styles.nearby,
        { backgroundColor: pressed ? colors.bg.subtle : colors.bg.surface, borderColor: colors.border.default },
      ]}
    >
      <View style={[styles.nearThumb, { backgroundColor: colors.bg.subtle }]}>
        {item.cover_thumb_key ? (
          <Image source={mediaUrl(item.cover_thumb_key)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
        ) : (
          <MapPin size={22} color={colors.text.tertiary} />
        )}
      </View>
      <View style={[styles.flex, styles.gapSm]}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {p.street ?? p.area}
        </AppText>
        <View style={styles.row}>
          <StatusBadge status={item.status} />
          <AppText variant="small" tone="secondary">
            {distance ? `${distance} · ` : ''}
            {t(SEVERITY_LABEL[item.severity])}
          </AppText>
        </View>
      </View>
      {chevron}
    </Pressable>
  );
}

function PersonCard({
  icon,
  title,
  name,
  detail,
  empty,
  loading,
}: {
  icon: ReactNode;
  title: string;
  name: string | null;
  detail: string | null;
  empty: string;
  loading: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, styles.person, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]} accessible>
      <View style={[styles.personIcon, { backgroundColor: colors.bg.brandTint }]}>{icon}</View>
      <AppText variant="small" tone="secondary">
        {title}
      </AppText>
      {loading ? (
        <AppText tone="tertiary">–</AppText>
      ) : name ? (
        <>
          <AppText variant="bodyStrong" numberOfLines={2}>
            {name}
          </AppText>
          {detail ? (
            <AppText variant="small" tone="secondary">
              {detail}
            </AppText>
          ) : null}
        </>
      ) : (
        <AppText variant="small" tone="secondary">
          {empty}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  partners: { gap: space[4], paddingVertical: space[1] },
  partner: { width: 140, borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  partnerLogo: { width: '100%', height: 56, borderRadius: radius.md },
  flex: { flex: 1 },
  content: { padding: space[7], paddingTop: space[5], gap: space[7] },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logo: { height: 40, width: 150 },
  bell: { width: 48, height: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 9, end: 11, width: 12, height: 12, borderRadius: 6, borderWidth: 2 },
  city: { borderRadius: radius.xl, padding: space[7], gap: space[5] },
  numbers: { flexDirection: 'row', gap: space[3] },
  number: { flex: 1, gap: space[1] },
  link: { minHeight: 32, justifyContent: 'center', alignSelf: 'flex-start' },
  underline: { textDecorationLine: 'underline' },
  section: { gap: space[4] },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  card: { borderWidth: 1, borderRadius: radius.lg + 4, padding: space[5] },
  gap: { gap: space[4] },
  gapSm: { gap: space[2] },
  inline: { gap: space[2] },
  carousel: { gap: space[4] },
  fixedCard: { width: 280, borderWidth: 1, borderRadius: radius.lg + 4, padding: space[4], gap: space[4] },
  pair: { flexDirection: 'row', gap: space[2] },
  thumb: { flex: 1, height: 96, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  stage: { position: 'absolute', top: space[3], start: space[3], paddingHorizontal: space[3], paddingVertical: 2, borderRadius: radius.sm },
  white: { color: '#FFFFFF' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  nearby: { flexDirection: 'row', alignItems: 'center', gap: space[4], padding: space[4] },
  nearThumb: { width: 60, height: 60, borderRadius: radius.md, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  people: { flexDirection: 'row', gap: space[4] },
  person: { flex: 1, gap: space[2] },
  personIcon: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
