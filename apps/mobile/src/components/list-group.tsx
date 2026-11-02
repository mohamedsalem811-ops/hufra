import { radius, space } from '@hufra/brand';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { Children, Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { AppText } from './app-text';

/** A white card of tappable rows separated by hairlines (design board 5, "Account"). */
export function ListGroup({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={[styles.group, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
      {rows.map((row, i) => (
        <Fragment key={i}>
          {i > 0 ? <View style={[styles.sep, { backgroundColor: colors.border.default }]} /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

export function ListRow({
  icon: Icon,
  label,
  hint,
  value,
  onPress,
  busy,
  role = 'button',
}: {
  icon: LucideIcon;
  label: string;
  hint?: string;
  /** Short text at the end of the row (a count, a state). */
  value?: string;
  onPress: () => void;
  busy?: boolean;
  role?: 'button' | 'link';
}) {
  const { colors } = useTheme();
  const { isRTL } = useI18n();
  const Chevron = isRTL ? ChevronLeft : ChevronRight;
  return (
    <Pressable
      accessibilityRole={role}
      accessibilityHint={hint}
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.bg.subtle }]}
    >
      <Icon size={20} color={colors.brand.primary} />
      <View style={styles.text}>
        <AppText>{label}</AppText>
        {hint ? (
          <AppText variant="small" tone="secondary">
            {hint}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="small" tone="secondary">
          {value}
        </AppText>
      ) : null}
      {busy ? <ActivityIndicator color={colors.brand.primary} /> : <Chevron size={18} color={colors.text.tertiary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  group: { borderWidth: 1, borderRadius: radius.lg + 2, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, marginHorizontal: space[5] },
  row: { minHeight: 56, paddingHorizontal: space[5], paddingVertical: space[3], flexDirection: 'row', alignItems: 'center', gap: space[4] },
  text: { flex: 1, gap: 2 },
});
