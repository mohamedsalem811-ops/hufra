import { radius, space } from '@hufra/brand';
import { PHOTO_LIMITS, TEXT_LIMITS, type Severity } from '@hufra/contracts';
import { Image } from 'expo-image';
import { Camera as CameraIcon, ChevronDown, ChevronUp, ImageIcon, Plus, ShieldCheck, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { SEVERITY_LABEL } from '../reports/status';
import type { DraftAction, ReportDraft, Step } from './draft';
import type { PickResult } from './photo-pick';

type Dispatch = (a: DraftAction) => void;

/** Step 2 (design board 3, screen 2). */
export function PhotosStep({
  draft,
  dispatch,
  pick,
}: {
  draft: ReportDraft;
  dispatch: Dispatch;
  pick: (source: 'camera' | 'gallery', remaining: number) => Promise<PickResult>;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [notice, setNotice] = useState<MessageKey | null>(null);
  const remaining = PHOTO_LIMITS.maxPerStage - draft.photos.length;

  async function add(source: 'camera' | 'gallery') {
    setNotice(null);
    const result = await pick(source, remaining);
    if (result.kind === 'picked') dispatch({ type: 'addPhotos', photos: result.photos });
    if (result.kind === 'denied') setNotice('report.photos.cameraDenied');
  }

  return (
    <View style={styles.step}>
      <View style={styles.titles}>
        <AppText variant="title2" accessibilityRole="header">
          {t('report.photos.title')}
        </AppText>
        <AppText tone="secondary">{t('report.photos.body')}</AppText>
      </View>

      <View style={styles.grid}>
        {draft.photos.map((p, i) => (
          <View key={p.uri} style={[styles.tile, { backgroundColor: colors.bg.subtle }]}>
            <Image source={p.uri} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('report.photos.remove', { n: i + 1 })}
              onPress={() => dispatch({ type: 'removePhoto', index: i })}
              style={styles.remove}
            >
              <X size={16} color="#FFFFFF" strokeWidth={2.6} />
            </Pressable>
          </View>
        ))}
        {remaining > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('report.photos.add')}
            onPress={() => add('camera')}
            style={[styles.tile, styles.addTile, { borderColor: colors.border.strong, backgroundColor: colors.bg.surface }]}
          >
            <Plus size={24} color={colors.brand.primary} />
            <AppText variant="caption" style={[fontFor(600), { color: colors.brand.primary }]}>
              {t('report.photos.add')}
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <AppText variant="small" tone="secondary">
        {t('report.photos.count', { n: draft.photos.length })}
      </AppText>

      <View style={styles.row}>
        <SourceButton icon={CameraIcon} label={t('report.photos.camera')} disabled={remaining === 0} onPress={() => add('camera')} />
        <SourceButton icon={ImageIcon} label={t('report.photos.gallery')} disabled={remaining === 0} onPress={() => add('gallery')} />
      </View>

      {notice ? (
        <View accessibilityLiveRegion="polite" style={[styles.note, { backgroundColor: colors.feedback.warningBg }]}>
          <AppText variant="small" style={{ color: colors.feedback.warningFg }}>
            {t(notice)}
          </AppText>
        </View>
      ) : null}

      <View style={[styles.note, styles.noteRow, { backgroundColor: colors.bg.brandTint }]}>
        <ShieldCheck size={20} color={colors.brand.primary} />
        <AppText variant="small" tone="secondary" style={styles.flex}>
          {t('report.photos.privacy')}
        </AppText>
      </View>
    </View>
  );
}

function SourceButton({ icon: Icon, label, disabled, onPress }: { icon: typeof CameraIcon; label: string; disabled: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.source,
        { borderColor: colors.brand.primary, backgroundColor: pressed ? colors.bg.brandTint : colors.bg.surface, opacity: disabled ? 0.5 : 1 },
      ]}
    >
      <Icon size={20} color={colors.brand.primary} />
      <AppText variant="bodyStrong" style={{ color: colors.brand.primary }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const SEVERITY_HINT: Record<Severity, MessageKey> = {
  minor: 'report.details.minor',
  medium: 'report.details.medium',
  severe: 'report.details.severe',
};

/** Step 3 (design board 3, screen 3). */
export function DetailsStep({ draft, dispatch }: { draft: ReportDraft; dispatch: Dispatch }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [measures, setMeasures] = useState(draft.widthCm !== '' || draft.depthCm !== '');
  const Chevron = measures ? ChevronUp : ChevronDown;

  return (
    <View style={styles.step}>
      <View accessibilityRole="radiogroup" style={styles.group}>
        <AppText variant="bodyStrong">{t('report.details.severity')}</AppText>
        {(['minor', 'medium', 'severe'] as const).map((s) => {
          const selected = draft.severity === s;
          return (
            <Pressable
              key={s}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              onPress={() => dispatch({ type: 'set', field: 'severity', value: s })}
              style={[
                styles.option,
                selected
                  ? { borderWidth: 2, borderColor: colors.border.focus, backgroundColor: colors.bg.brandTint }
                  : { borderWidth: 1, borderColor: colors.border.default, backgroundColor: colors.bg.surface },
              ]}
            >
              <View style={[styles.radio, { borderColor: selected ? colors.border.focus : colors.border.strong }]}>
                {selected ? <View style={[styles.radioDot, { backgroundColor: colors.border.focus }]} /> : null}
              </View>
              <View style={styles.flex}>
                <AppText variant="bodyStrong">{t(SEVERITY_LABEL[s])}</AppText>
                <AppText variant="small" tone="secondary">
                  {t(SEVERITY_HINT[s])}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>

      <LabeledInput
        label={t('report.details.street')}
        value={draft.street}
        maxLength={TEXT_LIMITS.street}
        onChangeText={(v) => dispatch({ type: 'set', field: 'street', value: v })}
      />
      <LabeledInput
        label={t('report.details.description')}
        value={draft.description}
        maxLength={TEXT_LIMITS.description}
        placeholder={t('report.details.descriptionPlaceholder')}
        multiline
        counter={`${draft.description.length} / ${TEXT_LIMITS.description}`}
        onChangeText={(v) => dispatch({ type: 'set', field: 'description', value: v })}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: measures }}
        onPress={() => setMeasures(!measures)}
        style={styles.measuresToggle}
      >
        <AppText variant="bodyStrong" style={{ color: colors.text.link }}>
          {t('report.details.measures')}
        </AppText>
        <Chevron size={20} color={colors.text.link} />
      </Pressable>
      {measures ? (
        <View style={styles.row}>
          <LabeledInput
            label={t('report.details.width')}
            value={draft.widthCm}
            keyboardType="number-pad"
            onChangeText={(v) => dispatch({ type: 'set', field: 'widthCm', value: v })}
          />
          <LabeledInput
            label={t('report.details.depth')}
            value={draft.depthCm}
            keyboardType="number-pad"
            onChangeText={(v) => dispatch({ type: 'set', field: 'depthCm', value: v })}
          />
        </View>
      ) : null}
    </View>
  );
}

function LabeledInput({
  label,
  counter,
  multiline,
  ...input
}: React.ComponentProps<typeof TextInput> & { label: string; counter?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.group, styles.flex]}>
      <AppText variant="small" style={fontFor(600)}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.text.tertiary}
        multiline={multiline}
        {...input}
        style={[
          styles.input,
          fontFor(400),
          multiline && styles.multiline,
          { borderColor: colors.border.strong, backgroundColor: colors.bg.surface, color: colors.text.primary },
        ]}
      />
      {counter ? (
        <AppText variant="caption" tone="secondary" style={styles.counter}>
          {counter}
        </AppText>
      ) : null}
    </View>
  );
}

/** Step 4 (design board 3, screen 4). */
export function ReviewStep({ draft, onEdit }: { draft: ReportDraft; onEdit: (step: Step) => void }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={styles.step}>
      <AppText variant="title2" accessibilityRole="header">
        {t('report.review.title')}
      </AppText>
      <Card title={draft.street || t('map.unknownStreet')} onEdit={() => onEdit('location')} />
      <Card title={t('report.review.photos', { n: draft.photos.length })} onEdit={() => onEdit('photos')}>
        <View style={styles.row}>
          {draft.photos.map((p) => (
            <Image key={p.uri} source={p.uri} style={[styles.reviewThumb, { backgroundColor: colors.bg.subtle }]} contentFit="cover" accessible={false} />
          ))}
        </View>
      </Card>
      <Card title={t('report.review.details')} onEdit={() => onEdit('details')}>
        {draft.severity ? (
          <AppText variant="small" tone="secondary">
            {t('report.review.severity', { s: t(SEVERITY_LABEL[draft.severity]) })}
          </AppText>
        ) : null}
        {draft.description ? (
          <AppText variant="small" tone="secondary">
            {draft.description}
          </AppText>
        ) : null}
      </Card>
      <AppText variant="small" tone="secondary">
        {t('report.review.public')}
      </AppText>
    </View>
  );
}

function Card({ title, onEdit, children }: { title: string; onEdit: () => void; children?: React.ReactNode }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <View style={[styles.card, { backgroundColor: colors.bg.surface, borderColor: colors.border.default }]}>
      <View style={styles.cardHeader}>
        <AppText variant="bodyStrong" style={styles.flex} numberOfLines={2}>
          {title}
        </AppText>
        <Button variant="text" label={t('report.review.edit')} onPress={onEdit} accessibilityLabel={`${t('report.review.edit')}: ${title}`} />
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  step: { gap: space[6] },
  titles: { gap: space[3] },
  flex: { flex: 1 },
  grid: { flexDirection: 'row', gap: space[4] },
  tile: { flex: 1, maxWidth: '32%', aspectRatio: 0.85, borderRadius: radius.lg, overflow: 'hidden' },
  addTile: { borderWidth: 2, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: space[2] },
  remove: {
    position: 'absolute',
    top: space[2],
    end: space[2],
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(14,27,38,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', gap: space[4] },
  source: {
    flex: 1,
    minHeight: 56,
    borderWidth: 1.5,
    borderRadius: radius.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[3],
  },
  note: { borderRadius: radius.lg, padding: space[5] },
  noteRow: { flexDirection: 'row', gap: space[4] },
  group: { gap: space[3] },
  option: { minHeight: 56, borderRadius: radius.md + 2, padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[4] },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[5], fontSize: 16 },
  multiline: { minHeight: 96, paddingTop: space[4], textAlignVertical: 'top' },
  counter: { alignSelf: 'flex-end' },
  measuresToggle: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: { borderWidth: 1, borderRadius: radius.lg + 2, padding: space[5], gap: space[3] },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  reviewThumb: { width: 72, height: 72, borderRadius: radius.md },
});
