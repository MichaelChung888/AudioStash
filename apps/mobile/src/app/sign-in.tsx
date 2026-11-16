import { useSignIn } from '@clerk/expo';
import { useSSO } from '@clerk/expo/experimental';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen, Touchable } from '../ui/components.tsx';
import { Logo } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

// Each needs turning on in Clerk under SSO connections.
const PROVIDERS = [
  { strategy: 'oauth_google', name: 'Google', icon: 'google' },
  { strategy: 'oauth_apple', name: 'Apple', icon: 'apple' },
  { strategy: 'oauth_github', name: 'GitHub', icon: 'github' },
  { strategy: 'oauth_facebook', name: 'Facebook', icon: 'facebook' },
] as const;

type Strategy = (typeof PROVIDERS)[number]['strategy'];

// password      email and password, or a social account
// secondFactor  a code Clerk emails when it wants a second check, e.g. on a new device
// resetCode     a code emailed to reset a forgotten password
// newPassword   choose the new password
type Step = 'password' | 'secondFactor' | 'resetCode' | 'newPassword';

const MIN_PASSWORD_LENGTH = 8;

// Sign-ups are turned off in Clerk, so only the owner can sign in. A social account
// signs in only if Clerk has linked it to the owner's user, which it does when the
// account's email matches.
export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const { startSSOFlow } = useSSO();
  const [step, setStep] = useState<Step>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ssoStrategy, setSsoStrategy] = useState<Strategy | null>(null);
  const busy = fetchStatus === 'fetching' || ssoStrategy !== null;

  // Every step ends here. Clerk can ask for an emailed code before it lets the
  // sign-in finish, so that step is handled too. Otherwise a new device would get stuck.
  async function finish() {
    if (signIn.status === 'complete') {
      const finalized = await signIn.finalize();
      if (finalized.error) setError(finalized.error.message);
      return;
    }
    const wantsCode = signIn.status === 'needs_second_factor' || signIn.status === 'needs_client_trust';
    if (wantsCode && signIn.supportedSecondFactors.some((factor) => factor.strategy === 'email_code')) {
      const sent = await signIn.mfa.sendEmailCode();
      if (sent.error) return setError(sent.error.message);
      goTo('secondFactor');
      return;
    }
    setError('This account needs a sign-in step that AudioStash does not support.');
  }

  function goTo(next: Step) {
    setCode('');
    setError(null);
    setStep(next);
  }

  async function signInWithPassword() {
    setError(null);
    const result = await signIn.password({ identifier: email.trim(), password });
    if (result.error) return setError(result.error.message);
    await finish();
  }

  async function verifySecondFactor() {
    setError(null);
    const result = await signIn.mfa.verifyEmailCode({ code: code.trim() });
    if (result.error) return setError(result.error.message);
    await finish();
  }

  async function sendResetCode() {
    setError(null);
    if (!email.includes('@')) return setError('Enter your email address first.');
    const created = await signIn.create({ identifier: email.trim() });
    if (created.error) return setError(created.error.message);
    const sent = await signIn.resetPasswordEmailCode.sendCode();
    if (sent.error) return setError(sent.error.message);
    goTo('resetCode');
  }

  async function verifyResetCode() {
    setError(null);
    const result = await signIn.resetPasswordEmailCode.verifyCode({ code: code.trim() });
    if (result.error) return setError(result.error.message);
    setNewPassword('');
    goTo('newPassword');
  }

  async function submitNewPassword() {
    setError(null);
    // Signs out the other devices, in case someone else knew the old password.
    const result = await signIn.resetPasswordEmailCode.submitPassword({ password: newPassword, signOutOfOtherSessions: true });
    if (result.error) return setError(result.error.message);
    await finish();
  }

  // Opens the provider's page in a browser tab. On success the session becomes
  // active and the app leaves this screen; closing the tab just returns here.
  async function signInWith(strategy: Strategy) {
    setError(null);
    setSsoStrategy(strategy);
    try {
      await startSSOFlow({ strategy });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Try again.');
    } finally {
      setSsoStrategy(null);
    }
  }

  return (
    <Screen bottom>
      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <View style={styles.brand}>
          <Logo size={56} />
          <Text style={styles.name}>AudioStash</Text>
        </View>

        {step === 'password' ? (
          <View style={styles.form}>
            <Field value={email} onChangeText={setEmail} placeholder="Email address" autoComplete="email" keyboardType="email-address" autoCapitalize="none" />
            <Field
              value={password}
              onChangeText={setPassword}
              placeholder="Password"
              autoComplete="current-password"
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="go"
              onSubmitEditing={signInWithPassword}
            />
            <Button label="Sign in" onPress={signInWithPassword} busy={fetchStatus === 'fetching'} disabled={busy || !email.includes('@') || !password} />
            <Touchable accessibilityRole="button" onPress={sendResetCode} disabled={busy} style={styles.link}>
              <Text style={styles.linkText}>Forgot password?</Text>
            </Touchable>

            <View style={styles.divider}>
              <View style={styles.line} />
              <Text style={text.secondary}>or continue with</Text>
              <View style={styles.line} />
            </View>
            <View style={styles.providers}>
              {PROVIDERS.map((provider) => (
                <Touchable
                  key={provider.strategy}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${provider.name}`}
                  onPress={() => signInWith(provider.strategy)}
                  disabled={busy}
                  style={styles.provider}
                >
                  <FontAwesome name={provider.icon} size={22} color={ssoStrategy === provider.strategy ? colors.accent : colors.text} />
                </Touchable>
              ))}
            </View>
          </View>
        ) : null}

        {step === 'secondFactor' || step === 'resetCode' ? (
          <View style={styles.form}>
            <Text style={text.secondary}>
              {step === 'secondFactor' ? 'To confirm it is you, enter' : 'To reset your password, enter'} the code sent to {email.trim()}.
            </Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={step === 'secondFactor' ? verifySecondFactor : verifyResetCode}
            />
            <Button
              label={step === 'secondFactor' ? 'Sign in' : 'Continue'}
              onPress={step === 'secondFactor' ? verifySecondFactor : verifyResetCode}
              busy={busy}
              disabled={code.trim().length < 6}
            />
            <Button label="Back to sign in" variant="quiet" onPress={() => goTo('password')} />
          </View>
        ) : null}

        {step === 'newPassword' ? (
          <View style={styles.form}>
            <Text style={text.secondary}>Choose a new password of at least {MIN_PASSWORD_LENGTH} characters.</Text>
            <Field
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password"
              autoComplete="new-password"
              secureTextEntry
              autoCapitalize="none"
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitNewPassword}
            />
            <Button label="Set password and sign in" onPress={submitNewPassword} busy={busy} disabled={newPassword.length < MIN_PASSWORD_LENGTH} />
            <Button label="Back to sign in" variant="quiet" onPress={() => goTo('password')} />
          </View>
        ) : null}

        {error ? (
          <Text accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', gap: 32, paddingHorizontal: 24 },
  brand: { alignItems: 'center', gap: 12 },
  name: { fontFamily: fonts.heading, fontSize: 32, letterSpacing: -0.64, color: colors.text },
  form: { gap: 12 },
  link: { alignSelf: 'center', paddingVertical: 8, paddingHorizontal: 12 },
  linkText: { ...text.secondary, color: colors.accent },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  providers: { flexDirection: 'row', gap: 12 },
  provider: { flex: 1, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.raised },
  error: { ...text.secondary, color: colors.danger, textAlign: 'center' },
});
