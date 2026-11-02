import { radius, shadowColor, space } from '@hufra/brand';
import type { Photo } from '@hufra/contracts';
import { Image } from 'expo-image';
import { ChevronsLeftRight } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, useCompetingGestures, usePanGesture, useTapGesture } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { AppText } from '@/components/app-text';
import { useI18n } from '@/i18n/i18n-provider';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { mediaUrl } from '../reports/format';

const STEP = 0.1;
/** Labels sit on photos, so they keep the same dark fills in both themes. */
const BEFORE_LABEL = '#0E1B26';
const AFTER_LABEL = '#146B43';

function clamp01(v: number) {
  'worklet';
  return Math.min(1, Math.max(0, v));
}

/**
 * Drag the handle to compare (design board 4, screen 1). "Before" sits on the
 * reading-start side: right in Arabic, left in English. Finger positions and
 * transforms are physical (left to right) on both platforms, so the moving
 * parts use only full-size layers and translateX, never left/right offsets.
 * Screen readers get an adjustable control (swipe up/down moves it by 10%).
 */
export function BeforeAfter({ before, after, height }: { before: Photo; after: Photo; height: number }) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const width = useSharedValue(0);
  // Divider position, as a share of the width from the left edge.
  const split = useSharedValue(0.5);
  const [percent, setPercent] = useState(50);

  /** How much of the picture shows "after", from a divider position. */
  function afterShare(at: number) {
    'worklet';
    return isRTL ? at : 1 - at;
  }
  function report(share: number) {
    setPercent(Math.round(share * 100));
  }

  /** x from the left edge -> divider position (left share). */
  function moveTo(x: number) {
    'worklet';
    if (width.value > 0) split.value = clamp01(x / width.value);
  }

  const pan = usePanGesture({
    activeOffsetX: [-6, 6],
    failOffsetY: [-14, 14],
    onUpdate: (e) => {
      'worklet';
      moveTo(e.x);
    },
    onFinalize: () => {
      'worklet';
      scheduleOnRN(report, afterShare(split.value));
    },
  });
  const tap = useTapGesture({
    onActivate: (e) => {
      'worklet';
      if (width.value <= 0) return;
      const to = clamp01(e.x / width.value);
      split.value = withTiming(to, { duration: 180 });
      scheduleOnRN(report, afterShare(to));
    },
  });
  const gesture = useCompetingGestures(pan, tap);

  // LTR: before = [0, split]; RTL: before = [split, 1]. The clip moves one way, its image the other.
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: isRTL ? split.value * width.value : (split.value - 1) * width.value }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: isRTL ? -split.value * width.value : (1 - split.value) * width.value }],
  }));
  // The divider layer is centred; move it from the middle to the split.
  const handleStyle = useAnimatedStyle(() => ({ transform: [{ translateX: (split.value - 0.5) * width.value }] }));

  function onLayout(e: LayoutChangeEvent) {
    width.value = e.nativeEvent.layout.width;
  }

  function nudge(by: number) {
    // "Increment" shows more of "after" (progress), whichever side it is on.
    const next = clamp01(afterShare(split.value) + by);
    // afterShare is its own inverse: the divider for a share is afterShare(share).
    split.value = withTiming(afterShare(next), { duration: 150 });
    setPercent(Math.round(next * 100));
  }

  const beforeLabel = (
    <View style={[styles.label, { backgroundColor: BEFORE_LABEL }]}>
      <AppText variant="small" style={[fontFor(600), styles.white]}>
        {t('detail.before')}
      </AppText>
    </View>
  );
  const afterLabel = (
    <View style={[styles.label, { backgroundColor: AFTER_LABEL }]}>
      <AppText variant="small" style={[fontFor(600), styles.white]}>
        {t('detail.after')}
      </AppText>
    </View>
  );

  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={onLayout}
        style={[styles.root, { height, backgroundColor: colors.bg.subtle }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('detail.compare')}
        accessibilityHint={t('detail.compareHint')}
        accessibilityValue={{ min: 0, max: 100, now: percent, text: `${t('detail.after')} ${percent}%` }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => nudge(e.nativeEvent.actionName === 'increment' ? STEP : -STEP)}
      >
        <Image source={mediaUrl(after.r2_key)} placeholder={mediaUrl(after.thumb_key)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
        <Animated.View style={[StyleSheet.absoluteFill, styles.clip, clipStyle]}>
          <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
            <Image source={mediaUrl(before.r2_key)} placeholder={mediaUrl(before.thumb_key)} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" accessible={false} />
          </Animated.View>
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.divider, handleStyle]}>
          <View style={styles.line} />
          <View style={[styles.knob, { top: height / 2 - 22 }]}>
            <ChevronsLeftRight size={22} color="#0E1B26" />
          </View>
        </Animated.View>
        <View pointerEvents="none" style={styles.labels}>
          {/* Row order follows the reading direction: before first. */}
          {beforeLabel}
          {afterLabel}
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { overflow: 'hidden' },
  clip: { overflow: 'hidden' },
  divider: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, alignItems: 'center' },
  line: { position: 'absolute', top: 0, bottom: 0, width: 3, backgroundColor: '#FFFFFF' },
  knob: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  labels: {
    position: 'absolute',
    bottom: space[5],
    left: 0,
    right: 0,
    paddingHorizontal: space[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: { paddingHorizontal: space[4], paddingVertical: space[1], borderRadius: radius.sm },
  white: { color: '#FFFFFF' },
});
