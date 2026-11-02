import { radius, space } from '@hufra/brand';
import { useRouter, type Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import { ClipboardList, House, Map as MapIcon, Plus, User, type LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { AppText } from './app-text';

/** The bar keeps its height with very large phone text (screen readers still read the full label). */
const TAB_LABEL_MAX_SCALE = 1.4;

export type BottomTabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

/** Route name -> icon and label. Order follows the routes in (tabs)/_layout.tsx. */
export const TAB_ITEMS: Record<string, { icon: LucideIcon; label: MessageKey; primary?: boolean }> = {
  index: { icon: House, label: 'tabs.home' },
  map: { icon: MapIcon, label: 'tabs.map' },
  report: { icon: Plus, label: 'tabs.report', primary: true },
  'my-reports': { icon: ClipboardList, label: 'tabs.myReports' },
  account: { icon: User, label: 'tabs.account' },
};

/**
 * Bottom tabs from the approved design: five items, the middle "Report" raised
 * in signal orange. Direction follows the language (Home sits on the right in Arabic).
 */
export function TabBar({ state, emitter, navigateToTab }: BottomTabBarProps) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colors.bg.surface,
          borderTopColor: colors.border.default,
          paddingBottom: Math.max(insets.bottom, space[4]),
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const item = TAB_ITEMS[route.name];
        if (!item) return null;
        const focused = state.index === index;
        const Icon = item.icon;
        const label = t(item.label);

        const onPress = () => {
          const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigateToTab(route.key);
        };

        if (item.primary) {
          // Reporting opens full screen over the tabs (design board 3) instead of switching tab.
          const openReport = () => router.push('/new-report');
          return (
            <Pressable
              key={route.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={label}
              onPress={openReport}
              style={styles.item}
            >
              {({ pressed }) => (
                <>
                  <View
                    style={[
                      styles.primary,
                      { backgroundColor: pressed ? colors.action.primaryPressed : colors.action.primary },
                    ]}
                  >
                    <Icon size={26} color={colors.action.onPrimary} strokeWidth={2.6} />
                  </View>
                  <AppText variant="caption" numberOfLines={1} maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE} style={[fontFor(600), { color: colors.text.primary }]}>
                    {label}
                  </AppText>
                </>
              )}
            </Pressable>
          );
        }

        const color = focused ? colors.brand.primary : colors.text.tertiary;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={onPress}
            style={({ pressed }) => [styles.item, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Icon size={24} color={color} strokeWidth={focused ? 2.2 : 2} />
            <AppText
              variant="caption"
              numberOfLines={1}
              maxFontSizeMultiplier={TAB_LABEL_MAX_SCALE}
              style={[fontFor(focused ? 700 : 500), { color }]}
            >
              {label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[3] },
  item: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: space[2], minHeight: 48 },
  primary: {
    width: 52,
    height: 52,
    borderRadius: radius.lg + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -space[7],
  },
});
