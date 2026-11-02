import { radius, space } from '@hufra/brand';
import type { Photo } from '@hufra/contracts';
import { Image } from 'expo-image';
import { ImageOff } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type ListViewToken } from 'react-native';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { mediaUrl } from '../reports/format';
import { PhotoViewer } from './photo-viewer';

export const HERO_HEIGHT = 300;

/** Swipeable report photos with page dots (design board 4, screen 2). Tap opens full screen. */
export function PhotoGallery({ photos }: { photos: Photo[] }) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [viewerAt, setViewerAt] = useState<number | null>(null);
  // The visible page comes from the list itself, which stays right in RTL on both platforms.
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (typeof first === 'number') setIndex(first);
  });

  if (photos.length === 0) {
    return (
      <View style={[styles.empty, { height: HERO_HEIGHT, backgroundColor: colors.bg.subtle }]}>
        <ImageOff size={32} color={colors.text.tertiary} />
        <AppText tone="secondary">{t('detail.noPhotos')}</AppText>
      </View>
    );
  }

  return (
    <View style={{ height: HERO_HEIGHT, backgroundColor: colors.bg.subtle }}>
      <FlatList
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(p) => String(p.id)}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <Pressable
            accessibilityRole="imagebutton"
            accessibilityLabel={t('detail.photoOf', { i: i + 1, n: photos.length })}
            accessibilityHint={t('detail.openPhoto')}
            onPress={() => setViewerAt(i)}
            style={{ width, height: HERO_HEIGHT }}
          >
            <Image
              source={mediaUrl(item.r2_key)}
              placeholder={mediaUrl(item.thumb_key)}
              placeholderContentFit="cover"
              style={StyleSheet.absoluteFill}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
              accessible={false}
            />
          </Pressable>
        )}
      />
      {photos.length > 1 ? (
        <View pointerEvents="none" style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {photos.map((p, i) => (
            <View key={p.id} style={[styles.dot, i === index ? styles.dotActive : styles.dotIdle]} />
          ))}
        </View>
      ) : null}
      {viewerAt !== null ? <PhotoViewer photos={photos} startAt={viewerAt} onClose={() => setViewerAt(null)} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { alignItems: 'center', justifyContent: 'center', gap: space[3] },
  dots: { position: 'absolute', bottom: space[5], left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: space[2] },
  dot: { height: 6, borderRadius: radius.pill },
  dotActive: { width: 20, backgroundColor: '#FFFFFF' },
  dotIdle: { width: 6, backgroundColor: 'rgba(255,255,255,0.6)' },
});
