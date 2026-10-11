/**
 * Login Screen — employee_code + PIN login for gate staff only.
 */
import { useMutation } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GateButton } from '@/components/gate/GateButton';
import { GateInput } from '@/components/gate/GateInput';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { loginApi } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [pin, setPin] = useState('');
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'error' | 'info' }>(
    { visible: false, message: '', type: 'error' }
  );

  const showError = (msg: string, type: 'error' | 'info' = 'error') => {
    setToast({ visible: true, message: msg, type });
  };

  const { mutate: login, isPending } = useMutation({
    mutationFn: () => {
      const trimmed = identifier.trim();
      const isEmail = trimmed.includes('@');
      return loginApi(
        isEmail
          ? { email: trimmed, secret: pin }
          : { employee_code: trimmed.toUpperCase(), secret: pin }
      );
    },
    onSuccess: async (data) => {
      await signIn(data.access_token, data.full_name, data.role);
      if (data.role === 'GM_MD_ADMIN' || data.role.includes('ADMIN')) {
        router.replace('/(admin)' as any);
      } else if (data.role === 'GODOWN_MANAGER_PKG') {
        router.replace('/(packaging)' as any);
      } else if (data.role === 'SUPERVISOR') {
        router.replace('/(supervisor)' as any);
      } else if (data.role.includes('GODOWN')) {
        router.replace('/(godown)' as any);
      } else {
        router.replace('/(gate)/vehicles');
      }
    },
    onError: (err: Error) => {
      showError(err.message || 'Login failed. Please check credentials.');
    },
  });

  const handleLogin = () => {
    if (!identifier.trim()) {
      showError('Employee code or email is required.');
      return;
    }
    if (!pin.trim()) {
      showError('PIN or Password is required.');
      return;
    }
    login();
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Logo / Header */}
          <View style={styles.header}>
            <View style={styles.logoRing}>
              <Text style={styles.logoIcon}>M</Text>
            </View>
            <Text style={styles.appName}>MillTrack</Text>
            <Text style={styles.appSub}>Operations & Gate Portal</Text>
          </View>

          {/* Card */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Sign In</Text>
            <Text style={styles.cardSub}>
              Enter your credentials to access your terminal or admin console.
            </Text>

            <View style={styles.fields}>
              <GateInput
                label="Employee Code or Email"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="e.g. GATE001 or admin@milltrack.com"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                testID="login-employee-code"
              />
              <GateInput
                label="PIN / Password"
                value={pin}
                onChangeText={setPin}
                placeholder="Enter PIN or password"
                secureTextEntry
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                testID="login-pin"
              />
            </View>

            <GateButton
              label={isPending ? '' : 'Sign In'}
              loading={isPending}
              onPress={handleLogin}
              disabled={isPending}
              testID="login-submit"
            />

            <Text style={styles.hint}>
              Supports Gateman, Supervisor, Godown, and Admin logins.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  kav: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 32,
  },

  // Header
  header: { alignItems: 'center', gap: 12 },
  logoRing: {
    width: 64,
    height: 64,
    borderRadius: GateRadius.lg,
    backgroundColor: GateColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoIcon: { fontSize: 28, fontWeight: '800', color: GateColors.onPrimary },
  appName: {
    fontSize: 32,
    fontWeight: '800',
    color: GateColors.textPrimary,
    letterSpacing: -0.5,
  },
  appSub: {
    fontSize: 14,
    fontWeight: '500',
    color: GateColors.textSecondary,
  },

  // Card
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.xl,
    padding: 24,
    gap: 20,
    ...GateShadow.card,
    borderWidth: 1,
    borderColor: GateColors.surface3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  cardSub: {
    fontSize: 14,
    color: GateColors.textSecondary,
    lineHeight: 20,
    marginTop: -8,
  },
  fields: { gap: 16 },

  hint: {
    fontSize: 12,
    color: GateColors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
