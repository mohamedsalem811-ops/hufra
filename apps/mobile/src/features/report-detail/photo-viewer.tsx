import { radius, space } from '@hufra/brand';
import type { Photo } from '@hufra/contracts';
import { Image } from 'expo-image';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions, type ListViewToken } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';

import { mediaUrl } from '../reports/format';

const STAGE_LABEL: Partial<Record<Photo['stage'], MessageKey>> = { before: 'detail.before', after: 'detail.after' };

/** Full-screen photos on black, opened at `startAt`. Pinch to zoom on iPhone (native scroll view zoom). */
export function PhotoViewer({ photos, startAt, onClose }: { photos: Photo[]; startAt: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const { t } = useI18n();
  const [index, setIndex] = useState(startAt);
  const [onViewable] = useState(() => ({ viewableItems }: { viewableItems: ListViewToken[] }) => {
    const first = viewableItems[0]?.index;
    if (typeof first === 'number') setIndex(first);
  });
  const current = photos[index];
  const stage = current ? STAGE_LABEL[current.stage] : undefined;

  return (
    <Modal visible animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait', 'landscape']}>
      <View style={styles.root}>
        <FlatList
            data={photos}
            horizontal
            pagingEnabled
            initialScrollIndex={startAt}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(p) => String(p.id)}
            onViewableItemsChanged={onViewable}
            viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            renderItem={({ item, index: i }) => (
              <ScrollView
                style={{ width, height }}
                contentContainerStyle={styles.page}
                maximumZoomScale={Platform.OS === 'ios' ? 3 : 1}
                minimumZoomScale={1}
                centerContent
                showsVerticalScrollIndicator={false}
                showsHorizontalScrollIndicator={false}
              >
                <Image
                  source={mediaUrl(item.r2_key)}
                  placeholder={mediaUrl(item.thumb_key)}
                  style={{ width, height }}
                  contentFit="contain"
                  cachePolicy="memory-disk"
                  accessibilityLabel={t('detail.photoOf', { i: i + 1, n: photos.length })}
                />
              </ScrollView>
            )}
          />
        <SafeAreaView edges={['top']} style={styles.top} pointerEvents="box-none">
          <Pressable accessibilityRole="button" accessibilityLabel={t('detail.closePhoto')} onPress={onClose} style={styles.close}>
            <X size={24} color="#FFFFFF" />
          </Pressable>
          <View style={styles.counter} accessibilityLiveRegion="polite">
            <AppText variant="small" style={styles.white}>
              {stage ? `${t(stage)} · ` : ''}
              {t('detail.photoOf', { i: index + 1, n: photos.length })}
            </AppText>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000000' },
  page: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space[5],
    paddingTop: space[3],
  },
  close: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  counter: { backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: space[4], paddingVertical: space[2], borderRadius: radius.pill },
  white: { color: '#FFFFFF' },
});
