/**
 * Loose stock — the shared, unclaimed pool of yarn cones. Nothing here belongs
 * to a client yet: a client is attached only when a bag is packed.
 */
import { useQuery } from '@tanstack/react-query';
import React, { useMemo } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DataTable, type Column } from '@/components/admin/DataTable';
import { PackagingHeader } from '@/components/packaging/PackagingHeader';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getLooseStockApi, getLookupsApi } from '@/lib/api';
import { bagKg, coneTypeShort } from '@/lib/cone';
import type { LooseStockRowOut } from '@/lib/types';

const fmt = (v: string | number) =>
  (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function LooseStockScreen() {
  const { data, isLoading, isError, error, refetch, isRefetching } = useQuery({
    queryKey: ['pkg-loose'],
    queryFn: getLooseStockApi,
    refetchInterval: 60_000,
  });
  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });

  const countLabel = (id: string) => lookups?.yarn_counts?.find((c) => c.id === id)?.label ?? '';
  const bobbinName = (id: string) => lookups?.bobbin_colours?.find((b) => b.id === id)?.name ?? '';
  const cone = (id: string) => lookups?.cone_types?.find((c) => c.id === id);

  const rows = useMemo(
    () =>
      [...(Array.isArray(data) ? data : [])].sort(
        (a, b) =>
          countLabel(a.count_id).localeCompare(countLabel(b.count_id), undefined, { numeric: true }) ||
          bobbinName(a.bobbin_colour_id).localeCompare(bobbinName(b.bobbin_colour_id))
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, lookups]
  );
  const total = rows.reduce((s, r) => s + (parseFloat(r.available_kg) || 0), 0);

  const columns: Column<LooseStockRowOut>[] = [
    { key: 'count', label: 'Count', flex: 0.9, strong: true, render: (r) => countLabel(r.count_id) },
    {
      key: 'cone',
      label: 'Cone type',
      flex: 2,
      render: (r) => {
        const c = cone(r.cone_type_id);
        return c ? coneTypeShort(c) : '';
      },
    },
    { key: 'bobbin', label: 'Bobbin', flex: 1.1, render: (r) => bobbinName(r.bobbin_colour_id) },
    { key: 'kg', label: 'Loose kg', flex: 1.2, align: 'right', accent: true, render: (r) => fmt(r.available_kg) },
  ];

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PackagingHeader />
      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={GateColors.primary} colors={[GateColors.primary]} />}
      >
        <View style={styles.page}>
          <View>
            <Text style={styles.title}>Loose stock</Text>
            <Text style={styles.sub}>
              Yarn cones waiting to be packed. This is one shared pool by count, cone type and bobbin colour. A client is
              attached only when a bag is packed.
            </Text>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={GateColors.primary} style={{ marginTop: 24 }} />
          ) : isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Could not load loose stock</Text>
              <Text style={styles.stateSub}>{(error as Error)?.message ?? 'Something went wrong.'}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => refetch()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : rows.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>No loose stock</Text>
              <Text style={styles.stateSub}>Cones logged as DOFFs by the supervisor appear here.</Text>
            </View>
          ) : (
            <>
              <View style={styles.totalCard}>
                <Text style={styles.totalLabel}>TOTAL LOOSE STOCK</Text>
                <Text style={styles.totalValue}>{fmt(total)} kg</Text>
              </View>
              <DataTable columns={columns} rows={rows} getKey={(r, i) => `${r.count_id}-${r.cone_type_id}-${r.bobbin_colour_id}-${i}`} />
              <Text style={styles.foot}>
                About {rows.map((r) => {
                  const c = cone(r.cone_type_id);
                  return c && bagKg(c) > 0 ? Math.floor((parseFloat(r.available_kg) || 0) / bagKg(c)) : 0;
                }).reduce((a, b) => a + b, 0)}{' '}
                full bags can be made from this stock (each row rounded down to whole bags).
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  scroll: { padding: 12, paddingBottom: 60 },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  sub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, marginTop: 3 },
  totalCard: { backgroundColor: GateColors.textPrimary, borderRadius: GateRadius.md, paddingVertical: 12, paddingHorizontal: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: GateColors.surface4 },
  totalValue: { fontSize: 20, fontWeight: '800', color: GateColors.onPrimary },
  foot: { fontSize: 12, lineHeight: 17, color: GateColors.textMuted },
  stateCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 28, alignItems: 'center', gap: 6 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
