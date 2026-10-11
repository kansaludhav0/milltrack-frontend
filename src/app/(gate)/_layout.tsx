/**
 * (gate) group layout — gate-pairing guard.
 * If no gate is paired, show the pairing screen.
 * Otherwise render children (the vehicle list + forms).
 */
import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { GateButton } from '@/components/gate/GateButton';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { getLookupsApi } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { getGateId, setGateId } from '@/lib/storage';
import type { Gate } from '@/lib/types';

export default function GateGroupLayout() {
  const { token, isLoading: authLoading } = useAuth();
  const [gateId, setGateIdState] = useState<string | null | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [selectedGate, setSelectedGate] = useState<Gate | null>(null);

  useEffect(() => {
    getGateId().then((id) => setGateIdState(id ?? null));
  }, []);

  const { data: lookups, isLoading: lookupsLoading } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
    enabled: !!token && gateId === null,
  });

  // Still checking SecureStore
  if (authLoading || gateId === undefined) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={GateColors.primary} />
      </View>
    );
  }

  // Not logged in
  if (!token) {
    return <Redirect href="/login" />;
  }

  // Gate already paired — render child screens
  if (gateId) {
    return (
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: GateColors.surface0 },
          animation: 'slide_from_right',
        }}
      />
    );
  }

  // ─── Gate Pairing Screen ──────────────────────────────────────────────────

  const handlePair = async () => {
    if (!selectedGate) return;
    setSaving(true);
    await setGateId(selectedGate.id);
    setGateIdState(selectedGate.id);
    setSaving(false);
  };

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <View style={styles.topSection}>
          <View style={styles.iconCircle}>
            <Text style={styles.iconText}>M</Text>
          </View>
          <Text style={styles.title}>Pair this Terminal</Text>
          <Text style={styles.subtitle}>
            Select the physical gate this device is stationed at. This is a one-time setup
            and persists across sessions.
          </Text>
        </View>

        {lookupsLoading ? (
          <ActivityIndicator color={GateColors.primary} style={{ marginTop: 24 }} />
        ) : (
          <ScrollView style={styles.gateList} contentContainerStyle={{ gap: 10 }}>
            {(lookups?.gates ?? []).map((gate) => {
              const selected = selectedGate?.id === gate.id;
              return (
                <TouchableOpacity
                  key={gate.id}
                  style={[styles.gateItem, selected && styles.gateItemSelected]}
                  onPress={() => setSelectedGate(gate)}
                  activeOpacity={0.7}
                  testID={`gate-option-${gate.code}`}
                >
                  <View style={styles.gateItemLeft}>
                    <View style={[styles.gateRadio, selected && styles.gateRadioSelected]}>
                      {selected && <View style={styles.gateRadioDot} />}
                    </View>
                    <View>
                      <Text style={styles.gateName}>{gate.name}</Text>
                      <Text style={styles.gateCode}>{gate.code}</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}

        <GateButton
          label="Set as This Terminal's Gate"
          disabled={!selectedGate}
          loading={saving}
          onPress={handlePair}
          testID="gate-pair-btn"
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: GateColors.surface0 },
  container: {
    flex: 1,
    padding: 24,
    gap: 20,
  },
  topSection: { alignItems: 'center', gap: 12, paddingVertical: 16 },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: GateColors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: GateColors.primary,
  },
  iconText: { fontSize: 30, fontWeight: '800', color: GateColors.primary },
  title: { fontSize: 24, fontWeight: '800', color: GateColors.textPrimary },
  subtitle: {
    fontSize: 14,
    color: GateColors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },

  gateList: { flex: 1 },
  gateItem: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 16,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
  },
  gateItemSelected: {
    borderColor: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
  },
  gateItemLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  gateRadio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: GateColors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateRadioSelected: { borderColor: GateColors.primary },
  gateRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: GateColors.primary,
  },
  gateName: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  gateCode: { fontSize: 13, color: GateColors.textSecondary, marginTop: 2 },
});
