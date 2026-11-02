import { radius, space } from '@hufra/brand';
import type { Region } from '@hufra/contracts';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import { useTheme } from '@/theme/theme-provider';

import { SEVERITY_LABEL, STATUS_LABEL } from '../reports/status';
import { ALL_SEVERITIES, ALL_STATUSES, DEFAULT_FILTERS, toggle, type MapFilters } from './filters';
import { StatusPin } from './status-pin';

/**
 * Status (several), severity (several) and area (one or all), applied together
 * (design board 2, screen 4). Choices stay local until "Show".
 */
export function FilterSheet({
  visible,
  value,
  regions,
  countFor,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: MapFilters;
  regions: readonly Region[];
  /** Number of loaded reports matching a draft, for the "Show N reports" button. */
  countFor: (f: MapFilters) => number;
  onApply: (f: MapFilters) => void;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  const [shownFor, setShownFor] = useState(value);
  if (visible && shownFor !== value) {
    // Opened again after the filters changed elsewhere: start from the current ones.
    setShownFor(value);
    setDraft(value);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('map.close')} style={[styles.scrim, { backgroundColor: colors.overlay.scrim }]} onPress={onClose} />
      <View
        accessibilityViewIsModal
        style={[styles.sheet, { backgroundColor: colors.bg.surface, paddingBottom: Math.max(insets.bottom, space[7]) }]}
      >
        <View style={[styles.grabber, { backgroundColor: colors.border.strong }]} />
        <View style={styles.header}>
          <AppText variant="title2" accessibilityRole="header">
            {t('filters.title')}
          </AppText>
          <Button variant="text" label={t('filters.clear')} onPress={() => setDraft(DEFAULT_FILTERS)} />
        </View>

        <ScrollView contentContainerStyle={styles.body}>
          <Section title={t('filters.status')}>
            <View style={styles.grid}>
              {ALL_STATUSES.map((s) => (
                <Chip
                  key={s}
                  selected={draft.statuses.includes(s)}
                  label={t(STATUS_LABEL[s])}
                  leading={<StatusPin status={s} size={16} />}
                  onPress={() => setDraft({ ...draft, statuses: toggle(draft.statuses, s, ALL_STATUSES) })}
                />
              ))}
            </View>
          </Section>

          <Section title={t('filters.severity')}>
            <View style={styles.grid}>
              {ALL_SEVERITIES.map((s) => (
                <Chip
                  key={s}
                  selected={draft.severities.includes(s)}
                  label={t(SEVERITY_LABEL[s])}
                  onPress={() => setDraft({ ...draft, severities: toggle(draft.severities, s, ALL_SEVERITIES) })}
                />
              ))}
            </View>
          </Section>

          <Section title={t('filters.region')}>
            <View style={styles.grid}>
              <Chip
                selected={draft.regionId === null}
                label={t('filters.allRegions')}
                onPress={() => setDraft({ ...draft, regionId: null })}
              />
              {regions.map((r) => (
                <Chip
                  key={r.id}
                  selected={draft.regionId === r.id}
                  label={locale === 'ar' ? r.name_ar : r.name_en}
                  onPress={() => setDraft({ ...draft, regionId: r.id })}
                />
              ))}
            </View>
          </Section>
        </ScrollView>

        <Button variant="brand" label={t('filters.show', { n: countFor(draft) })} onPress={() => onApply(draft)} />
      </View>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="bodyStrong">{title}</AppText>
      {children}
    </View>
  );
}

function Chip({
  label,
  selected,
  leading,
  onPress,
}: {
  label: string;
  selected: boolean;
  leading?: React.ReactNode;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[
        styles.chip,
        selected
          ? { borderWidth: 2, borderColor: colors.border.focus, backgroundColor: colors.bg.brandTint }
          : { borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.surface },
      ]}
    >
      {leading}
      <AppText variant={selected ? 'bodyStrong' : 'body'}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1 },
  sheet: {
    maxHeight: '85%',
    borderTopLeftRadius: radius.xxl - 4,
    borderTopRightRadius: radius.xxl - 4,
    paddingHorizontal: space[7],
    paddingTop: space[3],
    gap: space[5],
  },
  grabber: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  body: { gap: space[7], paddingBottom: space[5] },
  section: { gap: space[4] },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space[3] },
  chip: {
    minHeight: 44,
    paddingHorizontal: space[5],
    borderRadius: radius.md + 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
  },
});
