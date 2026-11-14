import { useSignIn } from '@clerk/expo';
import { useState } from 'react';
import { KeyboardAvoidingView, StyleSheet, Text, View } from 'react-native';
import { Button, Field, Screen } from '../ui/components.tsx';
import { Logo } from '../ui/Icon.tsx';
import { colors, fonts, text } from '../ui/theme.ts';

// Email code sign-in. AudioStash has one owner: sign-ups are turned off in Clerk, so only
// the owner's email address gets a code.
export default function SignInScreen() {
  const { signIn, fetchStatus } = useSignIn();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const busy = fetchStatus === 'fetching';

  async function sendCode() {
    setError(null);
    const created = await signIn.create({ identifier: email.trim() });
    if (created.error) return setError(created.error.message);
    const sent = await signIn.emailCode.sendCode();
    if (sent.error) return setError(sent.error.message);
    setStep('code');
  }

  async function verify() {
    setError(null);
    const verified = await signIn.emailCode.verifyCode({ code: code.trim() });
    if (verified.error) return setError(verified.error.message);
    if (signIn.status !== 'complete') return setError('This account needs another sign-in step that AudioStash does not support.');
    const finalized = await signIn.finalize();
    if (finalized.error) setError(finalized.error.message);
  }

  return (
    <Screen bottom>
      <KeyboardAvoidingView behavior="padding" style={styles.body}>
        <View style={styles.brand}>
          <Logo size={56} />
          <Text style={styles.name}>AudioStash</Text>
        </View>

        {step === 'email' ? (
          <View style={styles.form}>
            <Text style={text.secondary}>Sign in with your email. We will send you a code.</Text>
            <Field
              value={email}
              onChangeText={setEmail}
              placeholder="Email address"
              autoComplete="email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoFocus
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <Button label="Send code" onPress={sendCode} busy={busy} disabled={!email.includes('@')} />
          </View>
        ) : (
          <View style={styles.form}>
            <Text style={text.secondary}>Enter the code sent to {email.trim()}.</Text>
            <Field
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              autoComplete="one-time-code"
              keyboardType="number-pad"
              autoFocus
              maxLength={6}
              returnKeyType="done"
              onSubmitEditing={verify}
            />
            <Button label="Sign in" onPress={verify} busy={busy} disabled={code.trim().length < 6} />
            <Button
              label="Use a different email"
              variant="quiet"
              onPress={() => {
                setCode('');
                setError(null);
                setStep('email');
              }}
            />
          </View>
        )}

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
  error: { ...text.secondary, color: colors.danger, textAlign: 'center' },
});
