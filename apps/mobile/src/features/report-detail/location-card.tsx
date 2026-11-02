import { radius, space } from '@hufra/brand';
import type { PotholeStatus } from '@hufra/contracts';
import { Camera, Map } from '@maplibre/maplibre-react-native';
import { Map as MapIcon, Navigation } from 'lucide-react-native';
import { useMemo } from 'react';
import { ActionSheetIOS, Alert, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { buildMapStyle } from '../map/map-style';
import { StatusPin } from '../map/status-pin';
import { directionsUrls } from './model';

async function open(url: string, fallback?: string) {
  try {
    await Linking.openURL(url);
  } catch {
    if (fallback) await Linking.openURL(fallback).catch(() => undefined);
  }
}

/** Small still map of the spot, "Open on map", and directions in the person's maps app. */
export function LocationCard({
  lat,
  lng,
  status,
  label,
  onOpenMap,
}: {
  lat: number;
  lng: number;
  status: PotholeStatus;
  label: string;
  onOpenMap: () => void;
}) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const mapStyle = useMemo(() => buildMapStyle(scheme), [scheme]);

  function directions() {
    const urls = directionsUrls(lat, lng, label);
    if (Platform.OS === 'android') return void open(urls.android, urls.google);
    const options = [t('detail.appleMaps'), t('detail.googleMaps'), t('detail.cancel')];
    const pick = (i: number) => {
      if (i === 0) void open(urls.apple, urls.google);
      if (i === 1) void open(urls.google);
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title: t('detail.directionsIn'), options, cancelButtonIndex: 2 }, pick);
    } else {
      Alert.alert(t('detail.directionsIn'), undefined, [
        { text: options[0], onPress: () => pick(0) },
        { text: options[1], onPress: () => pick(1) },
        { text: options[2], style: 'cancel' },
      ]);
    }
  }

  return (
    <View style={styles.root}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('detail.openMap')}
        onPress={onOpenMap}
        style={[styles.map, { backgroundColor: colors.bg.subtle, borderColor: colors.border.default }]}
      >
        <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Map
            style={StyleSheet.absoluteFill}
            mapStyle={mapStyle}
            logo={false}
            attribution={false}
            compass={false}
            dragPan={false}
            touchZoom={false}
            doubleTapZoom={false}
            touchRotate={false}
            touchPitch={false}
          >
            <Camera initialViewState={{ center: [lng, lat], zoom: 16 }} />
          </Map>
          <View style={styles.pin}>
            <StatusPin status={status} size={34} />
          </View>
        </View>
        <View style={[styles.chip, { backgroundColor: colors.bg.surface }]}>
          <MapIcon size={16} color={colors.brand.primary} />
          <AppText variant="small" style={fontFor(600)}>
            {t('detail.openMap')}
          </AppText>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={directions}
        style={({ pressed }) => [
          styles.directions,
          { borderColor: colors.border.default, backgroundColor: pressed ? colors.bg.subtle : colors.bg.surface },
        ]}
      >
        <Navigation size={20} color={colors.brand.primary} />
        <AppText variant="bodyStrong" style={{ color: colors.brand.primary }}>
          {t('detail.directions')}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: space[3] },
  map: { height: 140, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  pin: { position: 'absolute', top: '50%', left: '50%', marginLeft: -17, marginTop: -42 },
  chip: {
    position: 'absolute',
    bottom: space[3],
    end: space[3],
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.md,
  },
  directions: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
});
