/**
 * Vehicles (home) screen — today's vehicle list with filters, pull-to-refresh,
 * one-tap exit, and FAB for new entry.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { StatusBadge } from '@/components/gate/StatusBadge';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { exitVehicleApi, getEntriesApi } from '@/lib/api';
import type { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useOfflineQueue } from '@/lib/OfflineQueueContext';

import type { EntriesFilter, Purpose, VehicleStatus, VehicleStatusOut } from '@/lib/types';

type PurposeFilter = Purpose | 'ALL';
type StatusFilter = VehicleStatus | 'ALL';

export default function VehiclesScreen() {
  const { fullName } = useAuth();
  const { pendingCount, flushQueue } = useOfflineQueue();
  const qc = useQueryClient();

  const [purposeFilter, setPurposeFilter] = useState<PurposeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [exitTarget, setExitTarget] = useState<VehicleStatusOut | null>(null);
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  const showToast = useCallback(
    (message: string, type: 'error' | 'info' | 'success' = 'error') => {
      setToast({ visible: true, message, type });
    },
    []
  );

  const filter: EntriesFilter = {
    ...(purposeFilter !== 'ALL' && { purpose: purposeFilter }),
    ...(statusFilter !== 'ALL' && { status: statusFilter }),
  };

  const {
    data: vehicles = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ['vehicles', filter],
    queryFn: () => getEntriesApi(filter),
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // auto-refresh every minute
  });

  // Flush offline queue whenever the screen is in focus
  useEffect(() => {
    flushQueue();
  }, [flushQueue]);

  const { mutate: exitVehicle, isPending: isExiting } = useMutation({
    mutationFn: async (vehicle: VehicleStatusOut) => {
      const entryId = vehicle.gate_entry_id || vehicle.id;
      return exitVehicleApi(entryId!);
    },
    onSuccess: () => {
      setExitTarget(null);
      showToast('Vehicle marked as exited.', 'success');
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
    onError: (err: ApiError, vehicle) => {
      setExitTarget(null);
      if (err.status === 409) {
        showToast('Already exited — refreshing list.', 'info');
        qc.invalidateQueries({ queryKey: ['vehicles'] });
      } else {
        showToast(err.message);
      }
    },
  });

  const renderVehicle = ({ item }: { item: VehicleStatusOut }) => {
    const isOnPremises = item.current_status === 'ON_PREMISES';
    const enteredTime = new Date(item.entered_at).toLocaleTimeString('en-IN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    const entryId = item.gate_entry_id || item.id || '';

    return (
      <TouchableOpacity
        style={styles.vehicleCard}
        activeOpacity={0.8}
        onPress={() => router.push({ pathname: '/(gate)/vehicle/[id]', params: { id: entryId } })}
        testID={`vehicle-row-${entryId}`}
      >
        {/* Thumbnail */}
        <View style={styles.thumbContainer}>
          <Image
            source={{ uri: item.photo_url }}
            style={styles.thumb}
            contentFit="cover"
            transition={200}
          />
          <StatusBadge
            label={item.purpose}
            variant={item.purpose}
            style={styles.thumbBadge}
            textStyle={{ fontSize: 8, letterSpacing: 0 }}
          />
        </View>

        {/* Info */}
        <View style={styles.vehicleInfo}>
          <Text style={styles.vehicleNumber} numberOfLines={1}>{item.vehicle_number}</Text>
          <View style={styles.vehicleTopRow}>
            <StatusBadge label={item.current_status} variant={item.current_status} />
            <Text style={styles.vehicleCode}>{item.entry_code}</Text>
          </View>
          {item.party_name && (
            <Text style={styles.vehicleMeta} numberOfLines={1}>
              {item.party_name}
            </Text>
          )}
          <Text style={styles.vehicleTime}>In at {enteredTime}</Text>
        </View>

        {/* Exit button */}
        {isOnPremises && (
          <TouchableOpacity
            style={styles.exitBtn}
            onPress={(e) => {
              e.stopPropagation?.();
              setExitTarget(item);
            }}
            testID={`exit-btn-${entryId}`}
          >
            <Text style={styles.exitBtnIcon}>↗</Text>
            <Text style={styles.exitBtnLabel}>Exit</Text>
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Gate Log</Text>
          <Text style={styles.headerSub}>Today&apos;s Vehicles</Text>
        </View>
        <View style={styles.headerRight}>
          {pendingCount > 0 && (
            <Pressable style={styles.pendingBadge} onPress={flushQueue}>
              <Text style={styles.pendingText}>{pendingCount} pending</Text>
            </Pressable>
          )}
          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => router.push('/(gate)/settings')}
            testID="settings-btn"
          >
            <Text style={styles.profileInitial}>{(fullName ?? 'G')[0]}</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Filters */}
      <View style={styles.filtersRow}>
        <View style={styles.filterGroup}>
          {(['ALL', 'UNLOADING', 'LOADING'] as PurposeFilter[]).map((p) => (
            <TouchableOpacity
              key={p}
              style={[styles.filterChip, purposeFilter === p && styles.filterChipActive]}
              onPress={() => setPurposeFilter(p)}
              testID={`filter-purpose-${p}`}
            >
              <Text
                style={[styles.filterChipLabel, purposeFilter === p && styles.filterChipLabelActive]}
              >
                {p === 'ALL' ? 'All' : p === 'UNLOADING' ? 'Unloading' : 'Loading'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.filterGroup}>
          {(['ALL', 'ON_PREMISES', 'EXITED'] as StatusFilter[]).map((s) => (
            <TouchableOpacity
              key={s}
              style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
              onPress={() => setStatusFilter(s)}
              testID={`filter-status-${s}`}
            >
              <Text
                style={[
                  styles.filterChipLabel,
                  statusFilter === s && styles.filterChipLabelActive,
                ]}
              >
                {s === 'ALL' ? 'All' : s === 'ON_PREMISES' ? 'On Premises' : 'Exited'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.loadingCenter}>
          <ActivityIndicator size="large" color={GateColors.primary} />
          <Text style={styles.loadingText}>Loading today&apos;s vehicles…</Text>
        </View>
      ) : (
        <FlatList
          data={vehicles}
          keyExtractor={(v) => v.gate_entry_id || v.id || v.entry_code}
          renderItem={renderVehicle}
          contentContainerStyle={[
            styles.listContent,
            vehicles.length === 0 && styles.emptyContent,
          ]}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>No vehicles yet</Text>
              <Text style={styles.emptySubtitle}>
                Tap + to log a new vehicle entry.
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={GateColors.primary}
              colors={[GateColors.primary]}
            />
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => router.push('/(gate)/new-entry')}
        activeOpacity={0.85}
        testID="new-entry-fab"
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>

      {/* Exit Confirmation */}
      <ConfirmDialog
        visible={!!exitTarget}
        title="Confirm Exit"
        message={`Mark ${exitTarget?.vehicle_number ?? ''} as exited? This cannot be undone.`}
        confirmLabel="Mark Exited"
        confirmVariant="danger"
        loading={isExiting}
        onConfirm={() => exitTarget && exitVehicle(exitTarget)}
        onCancel={() => setExitTarget(null)}
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

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },

  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 26, fontWeight: '800', color: GateColors.textPrimary },
  headerSub: { fontSize: 13, color: GateColors.primary, fontWeight: '600', marginTop: 2 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pendingBadge: {
    backgroundColor: GateColors.dangerLight,
    borderRadius: GateRadius.full,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: GateColors.danger,
  },
  pendingText: { fontSize: 12, color: GateColors.danger, fontWeight: '700' },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GateColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileInitial: { fontSize: 18, fontWeight: '800', color: GateColors.onPrimary },

  // Filters
  filtersRow: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterGroup: { flexDirection: 'row', gap: 6 },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: GateRadius.full,
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  filterChipActive: {
    backgroundColor: GateColors.primaryLight,
    borderColor: GateColors.primary,
  },
  filterChipLabel: { fontSize: 13, color: GateColors.textSecondary, fontWeight: '600' },
  filterChipLabelActive: { color: GateColors.primary },

  // List
  listContent: { paddingHorizontal: 16, paddingBottom: 120, paddingTop: 4 },
  emptyContent: { flex: 1, justifyContent: 'center' },

  // Vehicle card
  vehicleCard: {
    flexDirection: 'row',
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    alignItems: 'center',
  },
  thumbContainer: { position: 'relative', width: 68, height: 68 },
  thumb: {
    width: 68,
    height: 68,
    borderRadius: GateRadius.md,
    backgroundColor: GateColors.surface3,
  },
  thumbBadge: { position: 'absolute', bottom: 3, left: 3, right: 3, alignSelf: 'stretch', paddingHorizontal: 2, paddingVertical: 2, alignItems: 'center', borderRadius: 4 },
  vehicleInfo: { flex: 1, minWidth: 0, gap: 4 },
  vehicleTopRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 8,
    minWidth: 0,
  },
  vehicleNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: GateColors.textPrimary,
    letterSpacing: 0.3,
  },
  vehicleCode: { fontSize: 12, color: GateColors.textMuted, fontWeight: '600', fontFamily: 'monospace' },
  vehicleMeta: { fontSize: 13, color: GateColors.textSecondary },
  vehicleTime: { fontSize: 12, color: GateColors.textMuted },

  // Exit button
  exitBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.dangerLight,
    borderRadius: GateRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: GateColors.dangerLight,
    gap: 2,
  },
  exitBtnIcon: { fontSize: 18, color: GateColors.danger },
  exitBtnLabel: { fontSize: 10, color: GateColors.danger, fontWeight: '700' },

  // FAB
  fab: {
    position: 'absolute',
    bottom: 32,
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: GateColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...GateShadow.fab,
  },
  fabIcon: { fontSize: 32, color: GateColors.onPrimary, fontWeight: '300', lineHeight: 36 },

  // Loading / Empty
  loadingCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: GateColors.textSecondary, fontSize: 14 },
  emptyState: { alignItems: 'center', gap: 10, padding: 32 },
  emptyIcon: { fontSize: 48 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  emptySubtitle: { fontSize: 14, color: GateColors.textSecondary, textAlign: 'center' },
});
