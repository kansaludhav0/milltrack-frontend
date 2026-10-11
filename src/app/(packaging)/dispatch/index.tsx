/**
 * Dispatch — vehicles that came to LOAD and are still on the premises.
 * Pick one to open a dispatch and assign packed bags to it.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusBadge } from '@/components/gate/StatusBadge';
import { PackagingHeader } from '@/components/packaging/PackagingHeader';
import { useDispatchesByEntry } from '@/components/packaging/useDispatches';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { getLoadingVehiclesApi } from '@/lib/api';
import { formatElapsed } from '@/lib/format';
import type { VehicleStatusOut } from '@/lib/types';

export default function DispatchVehiclesScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['pkg-loading-vehicles'],
    queryFn: getLoadingVehiclesApi,
    refetchInterval: 30_000,
  });
  const vehicles = Array.isArray(data) ? data : [];
  const { byEntry } = useDispatchesByEntry();

  const renderItem = ({ item }: { item: VehicleStatusOut }) => {
    const entryId = item.gate_entry_id || item.id || '';
    const open = byEntry.get(entryId);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(packaging)/dispatch/[entryId]', params: { entryId } } as never)}
        accessibilityRole="button"
        accessibilityLabel={`Dispatch ${item.vehicle_number}`}
      >
        <View style={styles.cardMain}>
          <View style={styles.cardTop}>
            <Text style={styles.vehicleNumber} numberOfLines={1}>{item.vehicle_number}</Text>
            <StatusBadge label="LOADING" variant="LOADING" />
            {open ? <Text style={styles.inProgress}>{open.dispatch_code} in progress</Text> : null}
          </View>
          {item.party_name ? <Text style={styles.party} numberOfLines={1}>{item.party_name}</Text> : null}
          <Text style={styles.meta}>
            {item.entry_code} · here for {formatElapsed(item.entered_at)}
            {item.driver_name ? ` · ${item.driver_name}` : ''}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PackagingHeader />
      <View style={styles.page}>
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={GateColors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={styles.stateTitle}>Could not load vehicles</Text>
            <Text style={styles.stateSub}>{(error as Error)?.message ?? 'Something went wrong.'}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
              <Text style={styles.retryText}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={vehicles}
            keyExtractor={(v) => v.gate_entry_id || v.id || v.entry_code}
            renderItem={renderItem}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={GateColors.primary} colors={[GateColors.primary]} />}
            ListHeaderComponent={
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Vehicles to load</Text>
                <Text style={styles.subtitle}>
                  {vehicles.length === 0
                    ? 'Vehicles registered at the gate for loading appear here.'
                    : 'Select a vehicle to open or continue its dispatch.'}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.stateTitle}>No vehicles waiting to load</Text>
                <Text style={styles.stateSub}>Pull down to refresh.</Text>
              </View>
            }
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  page: { flex: 1, width: '100%', maxWidth: 720, alignSelf: 'center' },
  list: { padding: 12, paddingBottom: 40, gap: 10, flexGrow: 1 },
  titleBlock: { gap: 4, paddingBottom: 6 },
  title: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  subtitle: { fontSize: 13, color: GateColors.textSecondary },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GateColors.surface1, borderRadius: GateRadius.lg, borderWidth: 1, borderColor: GateColors.surface3, padding: 16, ...GateShadow.card },
  cardMain: { flex: 1, minWidth: 0, gap: 5 },
  cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  vehicleNumber: { fontSize: 18, fontWeight: '800', color: GateColors.textPrimary, letterSpacing: 0.3 },
  inProgress: { fontSize: 12, fontWeight: '700', color: GateColors.success },
  party: { fontSize: 14, color: GateColors.textPrimary },
  meta: { fontSize: 12, color: GateColors.textSecondary },
  chevron: { fontSize: 28, color: GateColors.textMuted, lineHeight: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 6 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
