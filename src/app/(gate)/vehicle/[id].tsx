/**
 * Vehicle detail screen — shows full entry info, exit button if still on premises.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

function InfoRow({ label, value }: { label: string; value: string | undefined | null }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { StatusBadge } from '@/components/gate/StatusBadge';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { exitVehicleApi, getEntriesApi } from '@/lib/api';
import type { ApiError } from '@/lib/api';
import { goBack } from '@/lib/navigation';

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const qc = useQueryClient();
  const [confirmExit, setConfirmExit] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'error' as const });

  // Reuse list query and find the entry — avoids a separate endpoint requirement
  const { data: vehicles = [], isLoading } = useQuery({
    queryKey: ['vehicles', {}],
    queryFn: () => getEntriesApi({}),
  });

  const vehicle = vehicles.find((v) => (v.gate_entry_id || v.id) === id);

  const { mutate: doExit, isPending: isExiting } = useMutation({
    mutationFn: () => exitVehicleApi(id!),
    onSuccess: () => {
      setConfirmExit(false);
      qc.invalidateQueries({ queryKey: ['vehicles'] });
      goBack();
    },
    onError: (err: ApiError) => {
      setConfirmExit(false);
      if (err.status === 409) {
        setToast({ visible: true, message: 'Already exited — refreshing.', type: 'error' });
        qc.invalidateQueries({ queryKey: ['vehicles'] });
      } else {
        setToast({ visible: true, message: err.message, type: 'error' });
      }
    },
  });


  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} style={styles.backBtn}>
          <Text style={styles.backLabel}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Entry Detail</Text>
        <View style={{ width: 64 }} />
      </View>

      {!vehicle && !isLoading ? (
        <View style={styles.center}>
          <Text style={styles.notFound}>Entry not found.</Text>
          <TouchableOpacity onPress={() => goBack()}>
            <Text style={styles.backLink}>Go back</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {vehicle && (
            <>
              {/* Photo */}
              <View style={styles.photoContainer}>
                <Image
                  source={{ uri: vehicle.photo_url }}
                  style={styles.photo}
                  contentFit="cover"
                  transition={300}
                />
                <View style={styles.photoBadges}>
                  <StatusBadge label={vehicle.purpose} variant={vehicle.purpose} />
                  <StatusBadge label={vehicle.current_status} variant={vehicle.current_status} />
                </View>
              </View>

              {/* Vehicle number */}
              <View style={styles.vehicleNumberBlock}>
                <Text style={styles.vehicleNumber}>{vehicle.vehicle_number}</Text>
                <Text style={styles.entryCode}>{vehicle.entry_code}</Text>
              </View>

              {/* Info */}
              <View style={styles.card}>
                <InfoRow
                  label="Entered At"
                  value={new Date(vehicle.entered_at).toLocaleString('en-IN')}
                />
                {vehicle.exited_at && (
                  <InfoRow
                    label="Exited At"
                    value={new Date(vehicle.exited_at).toLocaleString('en-IN')}
                  />
                )}
                <InfoRow label="Party" value={vehicle.party_name} />
                <InfoRow label="Driver" value={vehicle.driver_name} />
                <InfoRow label="Driver Mobile" value={vehicle.driver_mobile} />
                <InfoRow label="Material" value={vehicle.material_variety_name} />
                {vehicle.approx_bale_count != null && (
                  <InfoRow label="Approx Bales" value={String(vehicle.approx_bale_count)} />
                )}
                <InfoRow label="Invoice #" value={vehicle.invoice_number} />
              </View>

              {/* Bill photo (only if one was attached) */}
              {vehicle.bill_photo_url ? (
                <View style={styles.billBlock}>
                  <Text style={styles.billTitle}>Bill photo</Text>
                  <Image
                    source={{ uri: vehicle.bill_photo_url }}
                    style={styles.billPhoto}
                    contentFit="contain"
                    transition={300}
                  />
                </View>
              ) : null}

              {/* Exit button */}
              {vehicle.current_status === 'ON_PREMISES' && (
                <GateButton
                  label="Mark as Exited"
                  variant="danger"
                  size="lg"
                  onPress={() => setConfirmExit(true)}
                  testID="detail-exit-btn"
                />
              )}
            </>
          )}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={confirmExit}
        title="Confirm Exit"
        message={`Mark ${vehicle?.vehicle_number ?? ''} as exited? This cannot be undone.`}
        confirmLabel="Mark Exited"
        confirmVariant="danger"
        loading={isExiting}
        onConfirm={() => doExit()}
        onCancel={() => setConfirmExit(false)}
      />

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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
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

  content: { padding: 20, gap: 20, paddingBottom: 60 },

  photoContainer: { borderRadius: GateRadius.xl, overflow: 'hidden', position: 'relative' },
  photo: { width: '100%', height: 240 },
  billBlock: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    padding: 12,
    gap: 8,
  },
  billTitle: { fontSize: 13, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  billPhoto: { width: '100%', height: 260, borderRadius: GateRadius.md, backgroundColor: GateColors.surface2 },
  photoBadges: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    gap: 6,
  },

  vehicleNumberBlock: { gap: 4 },
  vehicleNumber: {
    fontSize: 28,
    fontWeight: '800',
    color: GateColors.textPrimary,
    letterSpacing: 1,
  },
  entryCode: {
    fontSize: 13,
    fontFamily: 'monospace',
    color: GateColors.textMuted,
    fontWeight: '600',
  },

  card: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  infoLabel: {
    fontSize: 13,
    color: GateColors.textSecondary,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  infoValue: {
    fontSize: 14,
    color: GateColors.textPrimary,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },

  notFound: { fontSize: 16, color: GateColors.textSecondary },
  backLink: { color: GateColors.primary, fontSize: 15, fontWeight: '600' },
});
