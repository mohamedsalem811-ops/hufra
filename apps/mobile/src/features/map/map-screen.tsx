import { radius, space } from '@hufra/brand';
import type { PotholeStatus } from '@hufra/contracts';
import { Camera, Map, UserLocation, ViewAnnotation, type CameraRef } from '@maplibre/maplibre-react-native';
import { useRouter } from 'expo-router';
import { LocateFixed, SlidersHorizontal } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { errorMessageKey } from '@/components/error-view';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { currentPosition, hasLocationPermission, requestLocation } from '@/permissions/permissions';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { placeName } from '../reports/format';
import { STATUS_LABEL, statusColors } from '../reports/status';
import { buildClusterIndex } from './clusters';
import { FilterSheet } from './filter-sheet';
import { activeFilterCount, ALL_STATUSES, applyFilters, DEFAULT_FILTERS, onlyStatus, type MapFilters } from './filters';
import { DEFAULT_ZOOM, isValidBounds, LIBYA_BOUNDS, toBboxParam, TRIPOLI_CENTER, type Bounds } from './geo';
import { buildMapStyle } from './map-style';
import { ReportPreview } from './report-preview';
import { StatusPin } from './status-pin';
import { useMapReports, useRegions } from './use-map-reports';

/** Rough Greater Tripoli viewport, used until the map reports its real one. */
const INITIAL_VIEW = { bounds: [13.07, 32.8, 13.32, 32.97] as Bounds, zoom: DEFAULT_ZOOM };
/** More annotations than this slows phones down; clustering keeps the real number far lower. */
const MAX_ANNOTATIONS = 250;

/** The public map (design board 2, screens 2-4; plan 6.1). */
export function MapScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors, scheme } = useTheme();
  const { t, locale } = useI18n();
  const camera = useRef<CameraRef>(null);

  const [view, setView] = useState(INITIAL_VIEW);
  const [filters, setFilters] = useState<MapFilters>(DEFAULT_FILTERS);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showUser, setShowUser] = useState(false);
  const [notice, setNotice] = useState<MessageKey | null>(null);

  useEffect(() => {
    hasLocationPermission().then(setShowUser);
  }, []);

  const reportsQuery = useMapReports(toBboxParam(view.bounds));
  const regions = useRegions().data ?? [];
  const allReports = useMemo(() => reportsQuery.data ?? [], [reportsQuery.data]);
  const visible = useMemo(() => applyFilters(allReports, filters), [allReports, filters]);
  const index = useMemo(() => buildClusterIndex(visible), [visible]);
  const items = useMemo(() => index.itemsIn(view.bounds, view.zoom).slice(0, MAX_ANNOTATIONS), [index, view]);
  const selected = visible.find((r) => r.id === selectedId) ?? null;
  const mapStyle = useMemo(() => buildMapStyle(scheme), [scheme]);
  const filterCount = activeFilterCount(filters);
  const singleStatus = filters.statuses.length === 1 ? filters.statuses[0] : null;

  async function goNearMe() {
    setNotice(null);
    if ((await requestLocation()) !== 'granted') {
      setNotice('map.locationDenied');
      return;
    }
    setShowUser(true);
    const pos = await currentPosition();
    if (!pos) {
      setNotice('map.locationDenied');
      return;
    }
    camera.current?.flyTo({ center: [pos.longitude, pos.latitude], zoom: 15, duration: 800 });
  }

  const bannerKey: MessageKey | null =
    notice ??
    (reportsQuery.isError && !reportsQuery.data
      ? errorMessageKey(reportsQuery.error)
      : reportsQuery.isPending
        ? 'map.loading'
        : !reportsQuery.isFetching && visible.length === 0
          ? 'map.empty'
          : null);

  return (
    <View style={[styles.root, { backgroundColor: colors.bg.subtle }]}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyle}
        logo={false}
        attribution={false}
        compass={false}
        touchRotate={false}
        touchPitch={false}
        onPress={() => setSelectedId(null)}
        onRegionDidChange={(e) => {
          const { bounds, zoom } = e.nativeEvent;
          if (isValidBounds(bounds)) setView({ bounds, zoom });
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: TRIPOLI_CENTER, zoom: DEFAULT_ZOOM }}
          maxBounds={LIBYA_BOUNDS}
          minZoom={6}
          maxZoom={18}
        />
        {showUser ? <UserLocation accuracy /> : null}
        {items.map((item) =>
          item.kind === 'cluster' ? (
            <ViewAnnotation
              key={`c${item.id}`}
              id={`c${item.id}`}
              lngLat={item.lngLat}
              onPress={() => camera.current?.easeTo({ center: item.lngLat, zoom: item.expansionZoom, duration: 400 })}
            >
              <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('map.clusterLabel', { n: item.count })}
                style={[styles.cluster, { backgroundColor: colors.brand.primary, borderColor: colors.bg.surface }]}
              >
                <AppText variant="bodyStrong" style={[fontFor(700), { color: colors.brand.onPrimary }]}>
                  {item.count}
                </AppText>
              </View>
            </ViewAnnotation>
          ) : (
            <ViewAnnotation
              key={`r${item.id}`}
              id={`r${item.id}`}
              lngLat={item.lngLat}
              anchor="bottom"
              onPress={() => setSelectedId(item.id)}
            >
              <View
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('map.reportPinLabel', {
                  status: t(STATUS_LABEL[item.report.status]),
                  place: placeName(item.report, locale).street ?? placeName(item.report, locale).area,
                })}
              >
                <StatusPin status={item.report.status} selected={item.id === selectedId} />
              </View>
            </ViewAnnotation>
          ),
        )}
      </Map>

      <View style={[styles.top, { paddingTop: insets.top + space[4] }]} pointerEvents="box-none">
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          style={styles.chipScroll}
        >
          <StatusChip
            label={t('map.all')}
            selected={filters.statuses.length === ALL_STATUSES.length}
            onPress={() => setFilters({ ...filters, statuses: onlyStatus(null) })}
          />
          {ALL_STATUSES.map((s) => (
            <StatusChip
              key={s}
              status={s}
              label={t(STATUS_LABEL[s])}
              selected={singleStatus === s}
              onPress={() => setFilters({ ...filters, statuses: onlyStatus(singleStatus === s ? null : s) })}
            />
          ))}
        </ScrollView>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={filterCount ? t('map.filtersActive', { n: filterCount }) : t('map.filters')}
          onPress={() => setFiltersOpen(true)}
          style={[styles.roundButton, { backgroundColor: colors.bg.surface, shadowColor: colors.text.primary }]}
        >
          <SlidersHorizontal size={22} color={colors.text.primary} />
          {filterCount ? (
            <View style={[styles.badge, { backgroundColor: colors.brand.primary }]}>
              <AppText variant="caption" style={[fontFor(700), { color: colors.brand.onPrimary, lineHeight: 16 }]}>
                {filterCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      {bannerKey ? (
        <View style={[styles.banner, { top: insets.top + 72, backgroundColor: colors.bg.surface }]} accessibilityLiveRegion="polite">
          <AppText variant="small" style={styles.center}>
            {t(bannerKey)}
          </AppText>
        </View>
      ) : null}

      <View style={styles.bottom} pointerEvents="box-none">
        {selected ? null : (
          <View style={styles.bottomRow} pointerEvents="box-none">
            <View style={[styles.attribution, { backgroundColor: colors.bg.surface }]}>
              <AppText variant="caption" tone="secondary">
                {t('map.attribution')}
              </AppText>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('map.nearMe')}
              onPress={goNearMe}
              style={[styles.roundButton, { backgroundColor: colors.bg.surface, shadowColor: colors.text.primary }]}
            >
              <LocateFixed size={22} color={colors.brand.primary} />
            </Pressable>
          </View>
        )}
        {selected ? (
          <ReportPreview
            report={selected}
            onClose={() => setSelectedId(null)}
            onOpen={() => router.push({ pathname: '/pothole/[id]', params: { id: String(selected.id) } })}
          />
        ) : null}
      </View>

      <FilterSheet
        visible={filtersOpen}
        value={filters}
        regions={regions}
        countFor={(f) => applyFilters(allReports, f).length}
        onApply={(f) => {
          setFilters(f);
          setFiltersOpen(false);
        }}
        onClose={() => setFiltersOpen(false)}
      />
    </View>
  );
}

function StatusChip({
  label,
  selected,
  status,
  onPress,
}: {
  label: string;
  selected: boolean;
  status?: PotholeStatus;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { backgroundColor: colors.brand.primary }
          : { backgroundColor: colors.bg.surface, borderColor: colors.border.default, borderWidth: 1 },
      ]}
    >
      {status ? <View style={[styles.dot, { backgroundColor: statusColors(colors, status).pin }]} /> : null}
      <AppText
        variant="small"
        style={[fontFor(selected ? 600 : 400), { color: selected ? colors.brand.onPrimary : colors.text.primary }]}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[5] },
  chipScroll: { flex: 1 },
  chips: { gap: space[3], paddingVertical: space[2] },
  chip: {
    minHeight: 40,
    paddingHorizontal: space[5],
    borderRadius: radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  roundButton: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  badge: {
    position: 'absolute',
    top: 6,
    end: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  cluster: {
    minWidth: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 3,
    paddingHorizontal: space[3],
    alignItems: 'center',
    justifyContent: 'center',
  },
  banner: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    paddingHorizontal: space[6],
    paddingVertical: space[4],
    borderRadius: radius.lg,
  },
  center: { textAlign: 'center' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: space[5], gap: space[4] },
  bottomRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  attribution: { paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.md },
});
