import { radius, space } from '@hufra/brand';
import { publicPotholeDetailResponseSchema } from '@hufra/contracts';
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-provider';
import { AppText } from '@/components/app-text';
import { ErrorView } from '@/components/error-view';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { formatDate, mediaUrl, placeName } from './format';
import { SEVERITY_LABEL } from './status';
import { StatusBadge } from './status-badge';

/**
 * Minimal report page reached from the map. The full detail screen (gallery,
 * before/after, timeline, confirm, share) replaces it in Phase 6.4.
 */
export function ReportDetailBasic({ id }: { id: number }) {
  const { api } = useApi();
  const router = useRouter();
  const { colors } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const query = useQuery({
    queryKey: ['pothole', id],
    enabled: Number.isInteger(id) && id > 0,
    queryFn: ({ signal }) =>
      api.request(`/api/potholes/${id}`, { schema: publicPotholeDetailResponseSchema, auth: false, signal }),
  });
  const Back = isRTL ? ChevronRight : ChevronLeft;

  if (query.isError) return <ErrorView error={query.error} onRetry={() => query.refetch()} />;

  const data = query.data;
  const photo = data?.photos.find((p) => p.stage === 'report') ?? data?.photos[0];
  const place = data ? placeName(data.pothole, locale) : null;
  const description =
    data && (locale === 'ar' ? data.pothole.description_ar ?? data.pothole.description_en : data.pothole.description_en ?? data.pothole.description_ar);

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('detail.back')}
          onPress={() => router.back()}
          style={[styles.back, { backgroundColor: colors.bg.subtle }]}
        >
          <Back size={22} color={colors.text.primary} />
        </Pressable>
        <AppText variant="title3">{t('detail.title')}</AppText>
      </View>

      {!data ? (
        <ActivityIndicator style={styles.loading} color={colors.brand.primary} />
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          {photo ? (
            <Image
              source={mediaUrl(photo.r2_key)}
              placeholder={mediaUrl(photo.thumb_key)}
              style={[styles.photo, { backgroundColor: colors.bg.subtle }]}
              contentFit="cover"
              transition={200}
              accessible={false}
            />
          ) : null}
          <StatusBadge status={data.pothole.status} />
          <AppText variant="title1" accessibilityRole="header">
            {place?.street ?? t('map.unknownStreet')}
          </AppText>
          <AppText tone="secondary">
            {place?.area} · {t(SEVERITY_LABEL[data.pothole.severity])}
          </AppText>
          <AppText tone="secondary">{t('map.reportedOn', { date: formatDate(data.pothole.created_at, locale) })}</AppText>
          {description ? <AppText>{description}</AppText> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: space[4], paddingHorizontal: space[5], paddingVertical: space[3] },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  loading: { marginTop: space[10] },
  body: { padding: space[7], gap: space[4] },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.xl },
});
