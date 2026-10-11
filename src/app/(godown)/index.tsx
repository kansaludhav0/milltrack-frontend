/**
 * Unloading queue — vehicles the gate has registered that are waiting to be
 * unloaded. Tapping one starts the unloading flow for that vehicle.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import React from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusBadge } from '@/components/gate/StatusBadge';
import { NavigationBar } from '@/components/navigation-bar';
import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { getUnloadingQueueApi } from '@/lib/api';
import { formatElapsed } from '@/lib/format';
import type { VehicleStatusOut } from '@/lib/types';

export default function UnloadingQueueScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['unloading-queue'],
    queryFn: getUnloadingQueueApi,
    refetchInterval: 30_000,
  });
  const vehicles = Array.isArray(data) ? data : [];

  const renderItem = ({ item }: { item: VehicleStatusOut }) => {
    const entryId = item.gate_entry_id || item.id || '';
    const details = [
      item.party_name,
      item.material_variety_name,
      item.approx_bale_count ? `~${item.approx_bale_count} bales` : null,
    ].filter(Boolean);

    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() => router.push({ pathname: '/(godown)/unload/[entryId]', params: { entryId } })}
        accessibilityRole="button"
        accessibilityLabel={`Unload ${item.vehicle_number}`}
        testID={`queue-vehicle-${entryId}`}
      >
        <View style={styles.cardMain}>
          <View style={styles.cardTop}>
            <Text style={styles.vehicleNumber} numberOfLines={1}>{item.vehicle_number}</Text>
            <StatusBadge label="UNLOADING" variant="UNLOADING" />
          </View>
          {details.length > 0 ? (
            <Text style={styles.details} numberOfLines={2}>{details.join(' · ')}</Text>
          ) : null}
          <Text style={styles.meta}>
            {item.entry_code} · waiting {formatElapsed(item.entered_at)}
            {item.driver_name ? ` · ${item.driver_name}` : ''}
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.page}>
        <View style={styles.navWrap}>
          <NavigationBar />
        </View>

        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={GateColors.primary} />
          </View>
        ) : isError ? (
          <View style={styles.center}>
            <Text style={styles.stateTitle}>Could not load the queue</Text>
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
            refreshControl={
              <RefreshControl
                refreshing={isRefetching}
                onRefresh={refetch}
                tintColor={GateColors.primary}
                colors={[GateColors.primary]}
              />
            }
            ListHeaderComponent={
              <View style={styles.titleBlock}>
                <Text style={styles.title}>Unloading queue</Text>
                <Text style={styles.subtitle}>
                  {vehicles.length === 0
                    ? 'Vehicles registered at the gate for unloading appear here.'
                    : `${vehicles.length} ${vehicles.length === 1 ? 'vehicle' : 'vehicles'} waiting. Select one to set up and start weighing.`}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.stateTitle}>No vehicles waiting</Text>
                <Text style={styles.stateSub}>Pull down to refresh. The list also updates automatically.</Text>
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
  navWrap: { paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 32, gap: 10, flexGrow: 1 },
  titleBlock: { paddingTop: 4, paddingBottom: 8, gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: GateColors.textPrimary },
  subtitle: { fontSize: 14, lineHeight: 20, color: GateColors.textSecondary },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    padding: 16,
    ...GateShadow.card,
  },
  cardMain: { flex: 1, minWidth: 0, gap: 6 },
  cardTop: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  vehicleNumber: { fontSize: 18, fontWeight: '800', color: GateColors.textPrimary, letterSpacing: 0.3 },
  details: { fontSize: 14, color: GateColors.textPrimary },
  meta: { fontSize: 12, color: GateColors.textSecondary },
  chevron: { fontSize: 28, color: GateColors.textMuted, lineHeight: 30 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  empty: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 24, gap: 6 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  retryBtn: {
    marginTop: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: GateRadius.md,
    backgroundColor: GateColors.primary,
  },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
