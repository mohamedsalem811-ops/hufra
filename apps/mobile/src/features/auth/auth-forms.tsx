import { radius, space } from '@hufra/brand';
import { emailSchema, PASSWORD_LIMITS } from '@hufra/contracts';
import { Check, ChevronLeft, ChevronRight, Eye, EyeOff } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '@/api/client';
import { AppText } from '@/components/app-text';
import { Button } from '@/components/button';
import { errorMessageKey } from '@/components/error-view';
import { useI18n } from '@/i18n/i18n-provider';
import type { MessageKey } from '@/i18n/messages';
import { fontFor } from '@/theme/fonts';
import { useTheme } from '@/theme/theme-provider';

import { useAuth } from './auth-provider';
import { openWebsite } from '../legal/website';

/** Plain-language message for a failed sign-in/sign-up (never a status code). */
export function authErrorKey(error: unknown, mode: 'signIn' | 'signUp'): MessageKey {
  if (error instanceof ApiError && error.kind === 'http') {
    if (error.status === 429) return 'auth.error.tooMany';
    if (error.status === 409) return 'auth.error.emailTaken';
    if (error.status === 400) return mode === 'signUp' ? 'auth.error.weakPassword' : 'auth.error.fields';
  }
  if (error instanceof ApiError && error.kind === 'unauthorized') return 'auth.error.invalid';
  return errorMessageKey(error);
}

export function SignInForm({ onDone, onCreateAccount, onBack }: { onDone: () => void; onCreateAccount: () => void; onBack: () => void }) {
  const { t } = useI18n();
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!emailSchema.safeParse(email).success || !password) return setError('auth.error.fields');
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      onDone();
    } catch (e) {
      setError(authErrorKey(e, 'signIn'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen title={t('auth.signIn.title')} subtitle={t('auth.signIn.subtitle')} onBack={onBack}>
      <Field testID="auth-email" label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" ltr />
      <PasswordField value={password} onChangeText={setPassword} autoComplete="current-password" onSubmit={submit} />
      <ErrorText messageKey={error} />
      <Button testID="auth-submit" label={t('auth.signIn.submit')} onPress={submit} disabled={busy} />
      <Divider label={t('auth.or')} />
      <Button variant="secondary" label={t('auth.createAccount')} onPress={onCreateAccount} disabled={busy} />
    </FormScreen>
  );
}

export function SignUpForm({ onDone, onSignIn, onBack }: { onDone: () => void; onSignIn: () => void; onBack: () => void }) {
  const { t, locale } = useI18n();
  const { colors } = useTheme();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!emailSchema.safeParse(email).success || password.length < PASSWORD_LIMITS.minLength) {
      return setError(password.length < PASSWORD_LIMITS.minLength ? 'auth.error.weakPassword' : 'auth.error.fields');
    }
    if (!consent) return setError('auth.error.consent');
    setBusy(true);
    setError(null);
    try {
      await signUp({ email: email.trim(), password, displayName: name.trim(), locale });
      onDone();
    } catch (e) {
      setError(authErrorKey(e, 'signUp'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScreen title={t('auth.signUp.title')} subtitle={t('auth.signUp.subtitle')} onBack={onBack}>
      <Field label={t('auth.name')} hint={t('auth.nameHint')} value={name} onChangeText={setName} autoComplete="name" />
      <Field label={t('auth.email')} value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" ltr />
      <PasswordField value={password} onChangeText={setPassword} autoComplete="new-password" hint={t('auth.passwordHint')} onSubmit={submit} />
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent }}
        onPress={() => setConsent(!consent)}
        style={styles.consent}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: consent ? colors.brand.primary : colors.border.strong, backgroundColor: consent ? colors.brand.primary : 'transparent' },
          ]}
        >
          {consent ? <Check size={16} color={colors.brand.onPrimary} strokeWidth={3} /> : null}
        </View>
        <AppText variant="small" style={styles.flex}>
          {t('auth.consent')}
        </AppText>
      </Pressable>
      <View style={styles.legalLinks}>
        <Button variant="text" accessibilityRole="link" label={t('auth.readTerms')} onPress={() => openWebsite(locale, '/terms')} />
        <Button variant="text" accessibilityRole="link" label={t('auth.readPrivacy')} onPress={() => openWebsite(locale, '/privacy')} />
      </View>
      <ErrorText messageKey={error} />
      <Button label={t('auth.signUp.submit')} onPress={submit} disabled={busy} />
      <Button variant="text" label={t('auth.haveAccount')} onPress={onSignIn} disabled={busy} />
    </FormScreen>
  );
}

function FormScreen({ title, subtitle, onBack, children }: { title: string; subtitle: string; onBack: () => void; children: React.ReactNode }) {
  const { colors } = useTheme();
  const { t, isRTL } = useI18n();
  const Back = isRTL ? ChevronRight : ChevronLeft;
  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: colors.bg.canvas }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('report.back')}
            onPress={onBack}
            style={[styles.back, { backgroundColor: colors.bg.subtle }]}
          >
            <Back size={22} color={colors.text.primary} />
          </Pressable>
          <View style={styles.titles}>
            <AppText variant="title1" accessibilityRole="header">
              {title}
            </AppText>
            <AppText tone="secondary">{subtitle}</AppText>
          </View>
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  label,
  hint,
  ltr,
  ...input
}: React.ComponentProps<typeof TextInput> & { label: string; hint?: string; ltr?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <AppText variant="small" style={fontFor(600)}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.text.tertiary}
        {...input}
        style={[
          styles.input,
          fontFor(400),
          { borderColor: colors.border.strong, backgroundColor: colors.bg.surface, color: colors.text.primary },
          ltr && styles.ltr,
        ]}
      />
      {hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function PasswordField({
  value,
  onChangeText,
  autoComplete,
  hint,
  onSubmit,
}: {
  value: string;
  onChangeText: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  onSubmit: () => void;
}) {
  const { colors } = useTheme();
  const { t } = useI18n();
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <View style={styles.field}>
      <AppText variant="small" style={fontFor(600)}>
        {t('auth.password')}
      </AppText>
      <View>
        <TextInput
          testID="auth-password"
          accessibilityLabel={t('auth.password')}
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={!visible}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={onSubmit}
          style={[
            styles.input,
            styles.passwordInput,
            fontFor(400),
            { borderColor: colors.border.strong, backgroundColor: colors.bg.surface, color: colors.text.primary },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? t('auth.hidePassword') : t('auth.showPassword')}
          onPress={() => setVisible(!visible)}
          style={styles.eye}
        >
          <Icon size={20} color={colors.text.secondary} />
        </Pressable>
      </View>
      {hint ? (
        <AppText variant="caption" tone="secondary">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

function ErrorText({ messageKey }: { messageKey: MessageKey | null }) {
  const { colors } = useTheme();
  const { t } = useI18n();
  if (!messageKey) return null;
  return (
    <View accessibilityLiveRegion="assertive" style={[styles.error, { backgroundColor: colors.feedback.dangerBg }]}>
      <AppText variant="small" style={{ color: colors.feedback.dangerFg }}>
        {t(messageKey)}
      </AppText>
    </View>
  );
}

function Divider({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.divider}>
      <View style={[styles.line, { backgroundColor: colors.border.default }]} />
      <AppText variant="small" tone="tertiary">
        {label}
      </AppText>
      <View style={[styles.line, { backgroundColor: colors.border.default }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  form: { padding: space[7], gap: space[6] },
  back: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  titles: { gap: space[3] },
  field: { gap: space[3] },
  input: { minHeight: 52, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space[5], fontSize: 16 },
  ltr: { writingDirection: 'ltr' },
  passwordInput: { paddingEnd: 52 },
  eye: { position: 'absolute', end: 4, top: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  consent: { flexDirection: 'row', alignItems: 'center', gap: space[4], minHeight: 44 },
  legalLinks: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space[5] },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  error: { borderRadius: radius.md, padding: space[5] },
  divider: { flexDirection: 'row', alignItems: 'center', gap: space[4] },
  line: { flex: 1, height: 1 },
});
