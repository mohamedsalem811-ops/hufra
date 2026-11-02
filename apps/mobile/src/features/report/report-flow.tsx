import { radius, space } from '@hufra/brand';
import { useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { Check, ChevronLeft, ChevronRight, CloudUpload, UserRound, X } from 'lucide-react-native';
import { useEffect, useReducer, useRef, useState } from 'react';
import { ActivityIndicator, Alert, BackHandler, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useApi } from '@/api/api-provider';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from '../auth/auth-provider';
import { classifyFailure } from '../outbox/processor';
import { isOnline, useOutbox } from '../outbox/outbox-provider';
import { canContinue, draftReducer, emptyDraft, isDirty, STEPS, type Step } from './draft';
import { LocationStep } from './location-step';
import { preparePhoto } from './photo-compress';
import { pickPhotos } from './photo-pick';
import { DetailsStep, PhotosStep, ReviewStep } from './report-steps';
import { initialSubmitState, submitReport, SubmitError, toCreateInput, type SubmitProgress, type SubmitState } from './submit';

const STEP_LABEL: Record<Step, MessageKey> = {
  location: 'report.step.location',
  photos: 'report.step.photos',
  details: 'report.step.details',
  review: 'report.step.review',
};

export interface ReportFlowNav {
  close: () => void;
  signIn: () => void;
  signUp: () => void;
  openReport: (id: number) => void;
}

/** Report a pothole (plan 6.2, design board 3). Account required: signed-out people see the gate first. */
export function ReportFlow({ nav }: { nav: ReportFlowNav }) {
  const { state } = useAuth();
  if (state.status === 'loading') return <Centered />;
  if (state.status === 'signedOut') return <SignInGate nav={nav} />;
  return <Flow nav={nav} />;
}

function Flow({ nav }: { nav: ReportFlowNav }) {
  const { colors } = useTheme();
  const { t, locale, isRTL } = useI18n();
  const { api } = useApi();
  const queryClient = useQueryClient();
  const [draft, dispatch] = useReducer(draftReducer, emptyDraft);
  const [sending, setSending] = useState<SubmitProgress | null>(null);
  const [failure, setFailure] = useState<{ key: MessageKey; state: SubmitState } | null>(null);
  const [sentId, setSentId] = useState<number | null>(null);
  const [savedOffline, setSavedOffline] = useState(false);
  const outbox = useOutbox();
  // One id per report: if the phone re-sends after a dropped connection, the server returns the same report.
  const clientUuid = useRef(randomUUID()).current;
  const stepIndex = STEPS.indexOf(draft.step);
  const Back = isRTL ? ChevronRight : ChevronLeft;

  function leave() {
    if (!isDirty(draft) || sentId !== null || savedOffline) return nav.close();
    Alert.alert(t('report.leave.title'), t('report.leave.body'), [
      { text: t('report.leave.cancel'), style: 'cancel' },
      { text: t('report.leave.confirm'), style: 'destructive', onPress: nav.close },
    ]);
  }

  function goBack() {
    if (sending) return true;
    if (stepIndex > 0 && sentId === null) dispatch({ type: 'back' });
    else leave();
    return true;
  }

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', goBack);
    return () => sub.remove();
  });

  /** No signal: keep the report on the phone; the outbox sends it when the connection returns. */
  async function keepForLater(state: SubmitState) {
    await outbox.enqueue(clientUuid, toCreateInput(draft, locale, clientUuid), draft.photos, state);
    setSavedOffline(true);
  }

  async function send(from: SubmitState = initialSubmitState) {
    setFailure(null);
    if (!(await isOnline())) return keepForLater(from);
    try {
      const { reportId } = await submitReport(toCreateInput(draft, locale, clientUuid), draft.photos, {
        api,
        prepare: preparePhoto,
        onProgress: setSending,
      }, from);
      setSentId(reportId);
      queryClient.invalidateQueries({ queryKey: ['map-reports'] });
    } catch (e) {
      const state = e instanceof SubmitError ? e.state : from;
      if (classifyFailure(e, state) !== 'failed') {
        // Connection dropped, server busy or session expired: keep it and send it later, automatically.
        try {
          await keepForLater(state);
          return;
        } catch {
          // Could not save on the phone either: fall through to the retry message.
        }
      }
      setFailure({ key: e instanceof SubmitError && e.reportCreated ? 'report.photosFailed' : 'report.sendFailed', state });
    } finally {
      setSending(null);
    }
  }

  if (sentId !== null) return <Sent id={sentId} nav={nav} />;
  if (savedOffline) return <SavedOffline nav={nav} />;

  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.bg.canvas }]}>
      <View style={[styles.header, { backgroundColor: colors.bg.surface, borderBottomColor: colors.border.default }]}>
        <View style={styles.headerRow}>
          {stepIndex > 0 ? (
            <IconButton label={t('report.back')} onPress={goBack} disabled={!!sending}>
              <Back size={22} color={colors.text.primary} />
            </IconButton>
          ) : (
            <View style={styles.iconSpacer} />
          )}
          <AppText variant="title3">{t('report.title')}</AppText>
          <IconButton label={t('report.close')} onPress={leave} disabled={!!sending}>
            <X size={20} color={colors.text.primary} />
          </IconButton>
        </View>
        <View style={styles.progressText}>
          <AppText variant="small" style={{ color: colors.text.primary }}>
            {t(STEP_LABEL[draft.step])}
          </AppText>
          <AppText variant="small" tone="secondary">
            {t('onboarding.stepOf', { n: stepIndex + 1, total: STEPS.length })}
          </AppText>
        </View>
        <View style={styles.progress} accessibilityElementsHidden>
          {STEPS.map((s, i) => (
            <View key={s} style={[styles.bar, { backgroundColor: i <= stepIndex ? colors.brand.primary : colors.border.default }]} />
          ))}
        </View>
      </View>

      {draft.step === 'location' ? (
        <LocationStep
          onConfirm={(location, street) => {
            dispatch({ type: 'setLocation', location, street });
            dispatch({ type: 'goto', step: 'photos' });
          }}
        />
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            {draft.step === 'photos' ? <PhotosStep draft={draft} dispatch={dispatch} pick={pickPhotos} /> : null}
            {draft.step === 'details' ? <DetailsStep draft={draft} dispatch={dispatch} /> : null}
            {draft.step === 'review' ? <ReviewStep draft={draft} onEdit={(step) => dispatch({ type: 'goto', step })} /> : null}
            {failure ? (
              <View accessibilityLiveRegion="assertive" style={[styles.failure, { backgroundColor: colors.feedback.dangerBg }]}>
                <AppText variant="small" style={{ color: colors.feedback.dangerFg }}>
                  {t(failure.key)}
                </AppText>
              </View>
            ) : null}
          </ScrollView>
          <SafeAreaView edges={['bottom']} style={styles.footer}>
            {sending ? (
              <View style={styles.sending} accessibilityLiveRegion="polite">
                <ActivityIndicator color={colors.brand.primary} />
                <AppText variant="small" tone="secondary">
                  {sending.phase === 'creating'
                    ? t('report.sending')
                    : t('report.uploading', { n: sending.done + 1, total: sending.total })}
                </AppText>
              </View>
            ) : draft.step === 'review' ? (
              <Button
                label={failure ? t('report.retry') : t('report.review.send')}
                disabled={!canContinue(draft, 'review')}
                onPress={() => send(failure?.state)}
              />
            ) : (
              <Button label={t('report.next')} disabled={!canContinue(draft)} onPress={() => dispatch({ type: 'next' })} />
            )}
          </SafeAreaView>
        </>
      )}
    </SafeAreaView>
  );
}

function Sent({ id, nav }: { id: number; nav: ReportFlowNav }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView style={[styles.root, styles.sent, { backgroundColor: colors.bg.canvas }]}>
      <View style={styles.sentTop}>
        <View style={[styles.sentHalo, { backgroundColor: colors.feedback.successBg }]}>
          <View style={[styles.sentCircle, { backgroundColor: colors.status.fixed.pin }]}>
            <Check size={40} color="#FFFFFF" strokeWidth={3} />
          </View>
        </View>
        <AppText variant="title1" accessibilityRole="header" style={styles.center}>
          {t('report.sent.title')}
        </AppText>
        <AppText tone="secondary" style={styles.center}>
          {t('report.sent.body', { id })}
        </AppText>
      </View>
      <View style={styles.sentActions}>
        <Button variant="brand" label={t('report.sent.view')} onPress={() => nav.openReport(id)} />
        <Button variant="text" label={t('report.sent.home')} onPress={nav.close} />
      </View>
    </SafeAreaView>
  );
}

/** Design board 6, screen 2: kept on the phone, sent automatically, once. */
function SavedOffline({ nav }: { nav: ReportFlowNav }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView style={[styles.root, styles.sent, { backgroundColor: colors.bg.canvas }]}>
      <View style={styles.sentTop}>
        <View style={[styles.sentHalo, { backgroundColor: colors.bg.brandTint }]}>
          <CloudUpload size={48} color={colors.brand.primary} strokeWidth={1.8} />
        </View>
        <AppText variant="title1" accessibilityRole="header" style={styles.center}>
          {t('outbox.saved.title')}
        </AppText>
        <AppText tone="secondary" style={styles.center}>
          {t('outbox.saved.body')}
        </AppText>
      </View>
      <View style={styles.sentActions}>
        <Button variant="brand" label={t('outbox.saved.ok')} onPress={nav.close} />
      </View>
    </SafeAreaView>
  );
}

/** Design board 5, screen 1: why an account is needed, then back to the report. */
function SignInGate({ nav }: { nav: ReportFlowNav }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView style={[styles.root, styles.gate, { backgroundColor: colors.bg.canvas }]}>
      <IconButton label={t('report.close')} onPress={nav.close}>
        <X size={20} color={colors.text.primary} />
      </IconButton>
      <View style={styles.gateBody}>
        <View style={[styles.gateIcon, { backgroundColor: colors.bg.brandTint }]}>
          <UserRound size={30} color={colors.brand.primary} />
        </View>
        <AppText variant="title1" accessibilityRole="header">
          {t('gate.title')}
        </AppText>
        <AppText tone="secondary">{t('gate.body')}</AppText>
      </View>
      <View style={styles.sentActions}>
        <Button label={t('auth.signUp.title')} onPress={nav.signUp} />
        <Button variant="secondary" label={t('auth.haveAccount')} onPress={nav.signIn} />
        <Button variant="text" label={t('onboarding.notNow')} onPress={nav.close} />
      </View>
    </SafeAreaView>
  );
}

function IconButton({ label, onPress, disabled, children }: { label: string; onPress: () => void; disabled?: boolean; children: React.ReactNode }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.iconButton, { backgroundColor: colors.bg.subtle, opacity: disabled ? 0.5 : 1 }]}
    >
      {children}
    </Pressable>
  );
}

function Centered() {
  const { colors } = useTheme();
  return (
    <View style={[styles.root, styles.centered, { backgroundColor: colors.bg.canvas }]}>
      <ActivityIndicator color={colors.brand.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center' },
  center: { textAlign: 'center' },
  header: { paddingHorizontal: space[5], paddingBottom: space[4], gap: space[4], borderBottomWidth: StyleSheet.hairlineWidth },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  iconButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  iconSpacer: { width: 48 },
  progressText: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: space[2] },
  progress: { flexDirection: 'row', gap: space[3], paddingHorizontal: space[2] },
  bar: { flex: 1, height: 4, borderRadius: 2 },
  body: { padding: space[7], gap: space[6] },
  footer: { paddingHorizontal: space[7], paddingBottom: space[6], paddingTop: space[3] },
  sending: { minHeight: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space[4] },
  failure: { borderRadius: radius.lg, padding: space[5] },
  sent: { padding: space[8], justifyContent: 'space-between' },
  sentTop: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[6] },
  sentHalo: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  sentCircle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  sentActions: { gap: space[3] },
  gate: { padding: space[7], gap: space[7] },
  gateBody: { flex: 1, justifyContent: 'center', gap: space[5] },
  gateIcon: { width: 64, height: 64, borderRadius: radius.xl, alignItems: 'center', justifyContent: 'center' },
});
