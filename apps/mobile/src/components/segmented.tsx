import { radius, space } from '@hufra/brand';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/theme-provider';
import { haptic } from '@/feedback/haptics';

import { AppText } from './app-text';

/** A row of mutually exclusive choices (radio group), e.g. language or theme. */
export function Segmented({
  title,
  options,
  onSelect,
}: {
  title: string;
  options: { key: string; label: string; selected: boolean }[];
  onSelect: (key: string) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.group}>
      <AppText variant="small" tone="secondary">
        {title}
      </AppText>
      <View accessibilityRole="radiogroup" accessibilityLabel={title} style={[styles.segmented, { backgroundColor: colors.bg.subtle }]}>
        {options.map((o) => (
          <Pressable
            key={o.key}
            accessibilityRole="radio"
            accessibilityState={{ checked: o.selected }}
            onPress={() => {
              if (!o.selected) haptic.select();
              onSelect(o.key);
            }}
            style={[styles.option, o.selected && { backgroundColor: colors.bg.surface }]}
          >
            <AppText variant={o.selected ? 'bodyStrong' : 'body'} tone={o.selected ? 'primary' : 'secondary'} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { gap: space[3] },
  segmented: { flexDirection: 'row', borderRadius: radius.md + 2, padding: space[2] },
  option: { flex: 1, minHeight: 44, borderRadius: radius.md - 2, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space[2] },
});
