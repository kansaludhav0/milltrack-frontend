/**
 * Settings screen — user info, change gate pairing, logout.
 */
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { useAuth } from '@/lib/AuthContext';
import { useOfflineQueue } from '@/lib/OfflineQueueContext';
import { setGateId } from '@/lib/storage';
import { goBack } from '@/lib/navigation';

export default function SettingsScreen() {
  const { fullName, signOut } = useAuth();
  const { pendingCount, flushQueue } = useOfflineQueue();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmChangeGate, setConfirmChangeGate] = useState(false);

  const handleLogout = async () => {
    await signOut();
    router.replace('/login');
  };

  const handleChangeGate = async () => {
    // Clear gate_id to trigger the gate-pairing screen
    await setGateId('');
    setConfirmChangeGate(false);
    // Force re-navigation so layout re-checks gate
    router.replace('/(gate)/vehicles');
  };

  function SettingsRow({
    label,
    value,
    onPress,
    danger,
  }: {
    label: string;
    value?: string;
    onPress?: () => void;
    danger?: boolean;
  }) {
    return (
      <TouchableOpacity
        style={styles.settingsRow}
        onPress={onPress}
        disabled={!onPress}
        activeOpacity={onPress ? 0.7 : 1}
      >
        <Text style={[styles.settingsLabel, danger && { color: GateColors.danger }]}>{label}</Text>
        {value && <Text style={styles.settingsValue}>{value}</Text>}
        {onPress && <Text style={styles.settingsChevron}>›</Text>}
      </TouchableOpacity>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile section */}
        <View style={styles.profileSection}>
          <View style={styles.profileAvatar}>
            <Text style={styles.profileInitial}>{(fullName ?? 'G')[0]}</Text>
          </View>
          <View>
            <Text style={styles.profileName}>{fullName ?? 'Gate Staff'}</Text>
            <Text style={styles.profileRole}>GATEMAN</Text>
          </View>
        </View>

        {/* Device section */}
        <Text style={styles.sectionTitle}>Device</Text>
        <View style={styles.settingsCard}>
          <SettingsRow
            label="Change Gate"
            value="Re-pair this device to a different gate"
            onPress={() => setConfirmChangeGate(true)}
          />
        </View>

        {/* Sync section */}
        {pendingCount > 0 && (
          <>
            <Text style={styles.sectionTitle}>Offline Sync</Text>
            <View style={styles.settingsCard}>
              <SettingsRow
                label={`${pendingCount} pending ${pendingCount === 1 ? 'entry' : 'entries'}`}
                value="Tap to retry sync now"
                onPress={flushQueue}
              />
            </View>
          </>
        )}

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.settingsCard}>
          <SettingsRow
            label="Sign Out"
            onPress={() => setConfirmLogout(true)}
            danger
          />
        </View>

        <Text style={styles.appVersion}>MillTrack Gateman v1.0</Text>
      </ScrollView>

      <ConfirmDialog
        visible={confirmLogout}
        title="Sign Out"
        message="You will need to log in again. The gate pairing will be preserved."
        confirmLabel="Sign Out"
        confirmVariant="danger"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />

      <ConfirmDialog
        visible={confirmChangeGate}
        title="Change Gate"
        message="This will clear the current gate pairing. You will need to select a gate again on the next screen."
        confirmLabel="Change Gate"
        onConfirm={handleChangeGate}
        onCancel={() => setConfirmChangeGate(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
  },
  backBtn: { padding: 8 },
  backLabel: { color: GateColors.primary, fontSize: 15, fontWeight: '600' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: GateColors.textPrimary },

  content: { padding: 20, gap: 14, paddingBottom: 60 },

  profileSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  profileAvatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: GateColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: { fontSize: 24, fontWeight: '800', color: GateColors.onPrimary },
  profileName: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  profileRole: {
    fontSize: 12,
    fontWeight: '700',
    color: GateColors.primary,
    letterSpacing: 2,
    marginTop: 2,
  },

  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: GateColors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingLeft: 4,
  },
  settingsCard: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    overflow: 'hidden',
  },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  settingsLabel: { fontSize: 15, fontWeight: '600', color: GateColors.textPrimary, flex: 1 },
  settingsValue: { fontSize: 12, color: GateColors.textSecondary, flex: 2, textAlign: 'right' },
  settingsChevron: { fontSize: 20, color: GateColors.textMuted },

  appVersion: {
    textAlign: 'center',
    fontSize: 12,
    color: GateColors.textMuted,
    marginTop: 24,
  },
});
