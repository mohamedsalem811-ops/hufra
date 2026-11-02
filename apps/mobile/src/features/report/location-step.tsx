import { radius, space } from '@hufra/brand';
import { Camera, Map, type CameraRef } from '@maplibre/maplibre-react-native';
import * as Location from 'expo-location';
import { Info, LocateFixed } from 'lucide-react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { currentPosition, requestLocation } from '@/permissions/permissions';
import { useTheme } from '@/theme/theme-provider';

import { LIBYA_BOUNDS, TRIPOLI_CENTER, type LngLat } from '../map/geo';
import { buildMapStyle } from '../map/map-style';
import { StatusPin } from '../map/status-pin';

/** Street name for a point, from the phone's own geocoder (no extra service). Empty if unknown. */
async function streetAt(latitude: number, longitude: number): Promise<string> {
  try {
    const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
    return place?.street ?? place?.name ?? '';
  } catch {
    return '';
  }
}

/**
 * Step 1 (design board 3, screen 1): the pin stays in the centre and the map
 * moves under it, which is easier on a phone than dragging a small pin.
 */
export function LocationStep({
  onConfirm,
}: {
  onConfirm: (location: { latitude: number; longitude: number; accuracy: number | null }, street: string) => void;
}) {
  const { colors, scheme } = useTheme();
  const { t } = useI18n();
  const camera = useRef<CameraRef>(null);
  const [center, setCenter] = useState<LngLat | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [street, setStreet] = useState('');
  const [status, setStatus] = useState<'locating' | 'ready' | 'noGps'>('locating');
  const mapStyle = useMemo(() => buildMapStyle(scheme), [scheme]);

  async function locate() {
    setStatus('locating');
    if ((await requestLocation()) !== 'granted') return setStatus('noGps');
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const lngLat: LngLat = [pos.coords.longitude, pos.coords.latitude];
      setAccuracy(pos.coords.accuracy ?? null);
      setCenter(lngLat);
      camera.current?.flyTo({ center: lngLat, zoom: 18, duration: 600 });
      setStatus('ready');
    } catch {
      const fallback = await currentPosition();
      if (fallback) {
        const lngLat: LngLat = [fallback.longitude, fallback.latitude];
        setCenter(lngLat);
        camera.current?.flyTo({ center: lngLat, zoom: 17, duration: 600 });
        setStatus('ready');
      } else {
        setStatus('noGps');
      }
    }
  }

  // Locate once on open (as a callback, not during the effect); the button locates again on demand.
  const locateRef = useRef(locate);
  useEffect(() => {
    const timer = setTimeout(() => locateRef.current(), 0);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!center) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      streetAt(center[1], center[0]).then((s) => !cancelled && setStreet(s));
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [center]);

  const hint =
    status === 'locating' ? t('report.location.locating') : status === 'noGps' ? t('report.location.noGps') : t('report.location.hint');

  return (
    <View style={styles.root}>
      <View style={styles.mapWrap}>
        <Map
          style={StyleSheet.absoluteFill}
          mapStyle={mapStyle}
          logo={false}
          attribution={false}
          compass={false}
          touchRotate={false}
          touchPitch={false}
          onRegionIsChanging={(e) => setCenter(e.nativeEvent.center)}
          onRegionDidChange={(e) => {
            setCenter(e.nativeEvent.center);
            // Once the person moves the map, GPS accuracy no longer describes the pin.
            if (e.nativeEvent.userInteraction) setAccuracy(null);
          }}
        >
          <Camera ref={camera} initialViewState={{ center: TRIPOLI_CENTER, zoom: 13 }} maxBounds={LIBYA_BOUNDS} minZoom={6} maxZoom={19} />
        </Map>
        <View pointerEvents="none" style={styles.centerPin} accessibilityElementsHidden>
          <StatusPin status="reported" size={44} />
          <View style={[styles.pinShadow, { backgroundColor: colors.overlay.scrim }]} />
        </View>
        <View style={[styles.hint, { backgroundColor: colors.bg.surface }]} accessibilityLiveRegion="polite">
          <Info size={18} color={colors.brand.primary} />
          <AppText variant="small" style={styles.flex}>
            {hint}
          </AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('report.location.myLocation')}
          onPress={locate}
          style={[styles.locate, { backgroundColor: colors.bg.surface }]}
        >
          <LocateFixed size={22} color={colors.brand.primary} />
        </Pressable>
      </View>

      <View style={[styles.sheet, { backgroundColor: colors.bg.surface }]}>
        <AppText variant="title3" numberOfLines={1}>
          {street || t('map.unknownStreet')}
        </AppText>
        {accuracy !== null ? (
          <AppText variant="small" tone="secondary">
            {t('report.location.accuracy', { m: Math.round(accuracy) })}
          </AppText>
        ) : null}
        <Button
          label={t('report.location.confirm')}
          disabled={!center}
          onPress={() => center && onConfirm({ latitude: center[1], longitude: center[0], accuracy }, street)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  mapWrap: { flex: 1 },
  centerPin: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginLeft: -22,
    marginTop: -55,
    alignItems: 'center',
  },
  pinShadow: { width: 14, height: 6, borderRadius: 7, marginTop: 2, opacity: 0.5 },
  hint: {
    position: 'absolute',
    top: space[5],
    left: space[5],
    right: space[5],
    flexDirection: 'row',
    gap: space[3],
    padding: space[5],
    borderRadius: radius.lg,
  },
  locate: {
    position: 'absolute',
    bottom: space[5],
    end: space[5],
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: space[7],
    gap: space[4],
  },
});
