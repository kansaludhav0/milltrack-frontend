/**
 * Godown stock — every bale in the godown, grouped by party, with an
 * "Add to mixing" action that issues the bale into the selected mixing lot.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { SelectField, SelectSheet } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { NavigationBar } from '@/components/navigation-bar';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  getGodownInventoryApi,
  getLookupsApi,
  getMixingLotsApi,
  getStockBalesApi,
  scanBaleIntoMixingApi,
} from '@/lib/api';
import type { StockBaleOut } from '@/lib/types';

const kg = (v: string | number) =>
  (typeof v === 'string' ? parseFloat(v) : v).toLocaleString('en-IN', { maximumFractionDigits: 1 });

export default function GodownStockScreen() {
  const qc = useQueryClient();

  // ─── Data ──────────────────────────────────────────────────────────────────
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const stock = useQuery({
    queryKey: ['godown-stock-bales', debouncedSearch],
    queryFn: () => getStockBalesApi({ search: debouncedSearch || undefined, limit: 500 }),
    refetchInterval: 60_000,
  });
  const summary = useQuery({ queryKey: ['godown-inventory'], queryFn: getGodownInventoryApi });
  const lotsQuery = useQuery({ queryKey: ['mixing-lots'], queryFn: getMixingLotsApi });
  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });

  const bales = useMemo(() => (Array.isArray(stock.data) ? stock.data : []), [stock.data]);
  const summaryRows = Array.isArray(summary.data) ? summary.data : [];
  const totalBales = summaryRows.reduce((sum, r) => sum + (r.bale_count || 0), 0);
  const totalKg = summaryRows.reduce((sum, r) => sum + (parseFloat(r.total_kg) || 0), 0);

  // ─── Target lot ────────────────────────────────────────────────────────────
  // The server only accepts new bales into a lot that is BUILDING.
  const openLots = (Array.isArray(lotsQuery.data) ? lotsQuery.data : []).filter(
    (l) => l.current_status === 'BUILDING'
  );
  const defaultLot = openLots[0];
  const [chosenLotId, setChosenLotId] = useState<string | null>(null);
  const targetLot = openLots.find((l) => l.id === chosenLotId) ?? defaultLot;

  // ─── Party groups ──────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    const map = new Map<string, StockBaleOut[]>();
    bales.forEach((b) => {
      const key = b.party_name || 'Unknown party';
      map.set(key, [...(map.get(key) ?? []), b]);
    });
    return [...map.entries()]
      .map(([party, items]) => ({
        party,
        items,
        totalKg: items.reduce((s, b) => s + (parseFloat(b.net_weight_kg) || 0), 0),
      }))
      .sort((a, b) => a.party.localeCompare(b.party));
  }, [bales]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // ─── Add to mixing ─────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });
  const [categoryFor, setCategoryFor] = useState<StockBaleOut | null>(null);
  const [qrBale, setQrBale] = useState<StockBaleOut | null>(null);

  const categories = lookups?.mixing_categories ?? [];
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? 'column';
  const defaultCatName = (b: StockBaleOut) =>
    b.default_mixing_category_id ? categories.find((c) => c.id === b.default_mixing_category_id)?.name ?? null : null;

  const { mutate: addToMixing, variables, isPending } = useMutation({
    mutationFn: async ({ bale, categoryId }: { bale: StockBaleOut; categoryId: string }) =>
      scanBaleIntoMixingApi(targetLot!.id, {
        id: uuid.v4() as string,
        bale_id: bale.id,
        mixing_category_id: categoryId,
      }),
    onSuccess: (_res, { bale, categoryId }) => {
      qc.invalidateQueries({ queryKey: ['godown-stock-bales'] });
      qc.invalidateQueries({ queryKey: ['godown-inventory'] });
      qc.invalidateQueries({ queryKey: ['mixing-lots'] });
      qc.invalidateQueries({ queryKey: ['mixing-lot-detail'] });
      showToast(`${bale.bale_code} added to ${targetLot?.lot_code} · ${categoryName(categoryId)}`);
    },
    onError: (err: Error) => {
      qc.invalidateQueries({ queryKey: ['mixing-lots'] });
      qc.invalidateQueries({ queryKey: ['godown-stock-bales'] });
      showToast(err.message || 'Could not add the bale to mixing.', 'error');
    },
  });

  const handleAdd = (bale: StockBaleOut) => {
    if (!targetLot) {
      showToast('No lot is in Building status. Create a new lot from the Mixing tab.', 'error');
      return;
    }
    const categoryId =
      bale.default_mixing_category_id ??
      lookups?.material_varieties.find((v) => v.id === bale.material_variety_id)?.default_mixing_category_id ??
      null;
    if (!categoryId) {
      setCategoryFor(bale); // no default column for this material: ask
      return;
    }
    addToMixing({ bale, categoryId });
  };

  const refreshing = stock.isRefetching || summary.isRefetching;
  const refreshAll = () => {
    stock.refetch();
    summary.refetch();
    lotsQuery.refetch();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refreshAll}
            tintColor={GateColors.primary}
            colors={[GateColors.primary]}
          />
        }
      >
        <View style={styles.page}>
          <NavigationBar />

          <View style={styles.titleBlock}>
            <Text style={styles.title}>Godown stock</Text>
            <Text style={styles.subtitle}>Bales in the godown by party. Add them to the open mixing lot.</Text>
          </View>

          <View style={styles.tiles}>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{totalBales.toLocaleString('en-IN')}</Text>
              <Text style={styles.tileLabel}>Bales in godown</Text>
            </View>
            <View style={styles.tile}>
              <Text style={styles.tileValue}>{kg(totalKg)}</Text>
              <Text style={styles.tileLabel}>Total net (kg)</Text>
            </View>
          </View>

          {/* Target lot */}
          {openLots.length > 0 ? (
            <SelectField
              label="Add bales into"
              placeholder="Select mixing lot"
              sheetTitle="Mixing lot"
              searchable={false}
              options={openLots.map((l) => ({
                id: l.id,
                title: l.lot_code,
                subtitle: `${kg(l.scanned_kg)} / ${kg(l.target_weight_kg)} kg`,
              }))}
              value={targetLot?.id ?? null}
              onChange={(id) => setChosenLotId(id)}
            />
          ) : lotsQuery.isLoading ? null : (
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                No lot is in Building status, so bales can&apos;t be added to mixing yet. Create a new lot from the Mixing tab.
              </Text>
            </View>
          )}

          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search bale code, party or material"
            placeholderTextColor={GateColors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />

          {stock.isLoading ? (
            <ActivityIndicator size="large" color={GateColors.primary} style={styles.loader} />
          ) : stock.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Could not load bales</Text>
              <Text style={styles.stateSub}>{(stock.error as Error)?.message ?? 'Something went wrong.'}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => stock.refetch()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : groups.length === 0 ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>{debouncedSearch ? 'No bales match' : 'No bales in the godown'}</Text>
              <Text style={styles.stateSub}>
                {debouncedSearch
                  ? 'Try a different search.'
                  : 'Bales weighed in during unloading will appear here.'}
              </Text>
            </View>
          ) : (
            groups.map((g) => {
              const isCollapsed = collapsed[g.party];
              return (
                <View key={g.party} style={styles.group}>
                  <TouchableOpacity
                    style={styles.groupHeader}
                    onPress={() => setCollapsed((c) => ({ ...c, [g.party]: !c[g.party] }))}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: !isCollapsed }}
                  >
                    <View style={styles.groupHeaderText}>
                      <Text style={styles.groupTitle} numberOfLines={1}>{g.party}</Text>
                      <Text style={styles.groupSub}>
                        {g.items.length} {g.items.length === 1 ? 'bale' : 'bales'} · {kg(g.totalKg)} kg
                      </Text>
                    </View>
                    <Text style={styles.chevron}>{isCollapsed ? '▸' : '▾'}</Text>
                  </TouchableOpacity>

                  {!isCollapsed &&
                    g.items.map((b) => {
                      const adding = isPending && variables?.bale.id === b.id;
                      return (
                        <View key={b.id} style={styles.baleRow}>
                          <View style={styles.baleTop}>
                            <View style={styles.baleInfo}>
                              <View style={styles.baleCodeRow}>
                                <Text style={styles.baleCode}>{b.bale_code}</Text>
                                {defaultCatName(b) ? (
                                  <Text style={styles.colBadge} numberOfLines={1}>→ {defaultCatName(b)}</Text>
                                ) : null}
                              </View>
                              <Text style={styles.baleMeta} numberOfLines={2}>
                                {b.material_variety_name} · Grade {b.quality_grade} · {b.godown_location_name}
                              </Text>
                              <Text style={styles.baleMeta} numberOfLines={1}>
                                {b.vehicle_number} · Gross {kg(b.gross_weight_kg)} kg · Tare {Math.round(parseFloat(b.tare_weight_kg) * 1000)} g
                              </Text>
                            </View>
                            <View style={styles.netBox}>
                              <Text style={styles.baleKg}>{kg(b.net_weight_kg)}</Text>
                              <Text style={styles.netUnit}>kg net</Text>
                            </View>
                          </View>
                          <View style={styles.baleActions}>
                            <TouchableOpacity
                              style={styles.qrBtn}
                              onPress={() => setQrBale(b)}
                              accessibilityLabel={`View QR for ${b.bale_code}`}
                            >
                              <Text style={styles.qrBtnText}>View QR</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.addBtn, (adding || !targetLot) && styles.addBtnDisabled]}
                              onPress={() => handleAdd(b)}
                              disabled={adding}
                              accessibilityLabel={`Add ${b.bale_code} to mixing`}
                            >
                              {adding ? (
                                <ActivityIndicator size="small" color={GateColors.onPrimary} />
                              ) : (
                                <Text style={styles.addBtnText}>Add to mixing</Text>
                              )}
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                </View>
              );
            })
          )}

          {/* Totals by location / material / grade */}
          {summaryRows.length > 0 ? (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>By location and grade</Text>
              {summaryRows.map((r, i) => (
                <View key={`${r.location}-${r.variety}-${r.quality_grade}-${i}`} style={styles.summaryRow}>
                  <View style={styles.summaryText}>
                    <Text style={styles.summaryMain} numberOfLines={1}>{r.location} · {r.variety}</Text>
                    <Text style={styles.summarySub}>Grade {r.quality_grade} · {r.bale_count} bales</Text>
                  </View>
                  <Text style={styles.summaryKg}>{kg(r.total_kg)} kg</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>

      {/* Material with no default column: pick one */}
      <SelectSheet
        visible={!!categoryFor}
        title="Add to which column?"
        options={categories.filter((c) => c.kind === 'FIBRE').map((c) => ({ id: c.id, title: c.name }))}
        value={null}
        searchable={false}
        searchPlaceholder=""
        emptyText="No mixing columns available"
        onClose={() => setCategoryFor(null)}
        onSelect={(id) => {
          if (id && categoryFor) addToMixing({ bale: categoryFor, categoryId: id });
        }}
      />

      <Modal visible={!!qrBale} transparent animationType="fade" onRequestClose={() => setQrBale(null)}>
        <View style={styles.qrRoot}>
          <View style={styles.qrCard}>
            <Text style={styles.qrCode}>{qrBale?.bale_code}</Text>
            <Text style={styles.qrMeta}>
              {qrBale?.party_name} · {qrBale?.material_variety_name}
            </Text>
            <View style={styles.qrBox}>
              {qrBale?.qr_payload ? (
                <QRCode value={qrBale.qr_payload} size={190} color="#000" backgroundColor="#FFF" />
              ) : (
                <Text style={styles.qrMissing}>This bale has no QR payload.</Text>
              )}
            </View>
            <Text style={styles.qrNet}>{qrBale ? kg(qrBale.net_weight_kg) : ''} kg net</Text>
            <TouchableOpacity style={styles.qrClose} onPress={() => setQrBale(null)}>
              <Text style={styles.qrCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Toast
        position="top"
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
  scroll: { paddingBottom: 40 },
  page: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  titleBlock: { gap: 4 },
  title: { fontSize: 24, fontWeight: '700', color: GateColors.textPrimary },
  subtitle: { fontSize: 14, lineHeight: 20, color: GateColors.textSecondary },
  loader: { marginVertical: 40 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: {
    flex: 1,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    padding: 16,
    gap: 2,
  },
  tileValue: { fontSize: 24, fontWeight: '800', color: GateColors.textPrimary },
  tileLabel: { fontSize: 12, color: GateColors.textSecondary },
  notice: {
    backgroundColor: GateColors.warningLight,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: { fontSize: 13, lineHeight: 18, color: GateColors.warning },
  searchInput: {
    minHeight: 46,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    fontSize: 15,
    color: GateColors.textPrimary,
  },
  group: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    overflow: 'hidden',
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: GateColors.surface2,
  },
  groupHeaderText: { flex: 1, minWidth: 0 },
  groupTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  groupSub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 2 },
  chevron: { fontSize: 16, color: GateColors.textSecondary },
  baleRow: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
  baleTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  baleCodeRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  colBadge: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: GateRadius.full,
    overflow: 'hidden',
  },
  netBox: { alignItems: 'flex-end' },
  netUnit: { fontSize: 11, color: GateColors.textSecondary },
  baleActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  qrBtn: {
    minHeight: 36,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  qrBtnText: { fontSize: 13, fontWeight: '600', color: GateColors.textPrimary },
  qrRoot: { flex: 1, backgroundColor: GateColors.overlay, alignItems: 'center', justifyContent: 'center', padding: 24 },
  qrCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.xl,
    padding: 24,
    alignItems: 'center',
    gap: 8,
  },
  qrCode: { fontSize: 20, fontWeight: '800', color: GateColors.textPrimary, letterSpacing: 0.5 },
  qrMeta: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center' },
  qrBox: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: GateRadius.md, marginVertical: 8, minHeight: 100, justifyContent: 'center' },
  qrMissing: { fontSize: 13, color: GateColors.textMuted },
  qrNet: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  qrClose: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 28, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  qrCloseText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
  baleInfo: { flex: 1, minWidth: 0, gap: 2 },
  baleCode: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
  baleMeta: { fontSize: 12, lineHeight: 16, color: GateColors.textSecondary },
  baleKg: { fontSize: 18, fontWeight: '800', color: GateColors.textPrimary },
  addBtn: {
    minWidth: 120,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    borderRadius: GateRadius.md,
    backgroundColor: GateColors.primary,
  },
  addBtnDisabled: { opacity: 0.5 },
  addBtnText: { fontSize: 13, fontWeight: '700', color: GateColors.onPrimary },
  summaryCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    padding: 16,
    gap: 4,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: GateColors.textSecondary, marginBottom: 4 },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
  summaryText: { flex: 1, minWidth: 0 },
  summaryMain: { fontSize: 14, fontWeight: '600', color: GateColors.textPrimary },
  summarySub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  summaryKg: { fontSize: 14, fontWeight: '800', color: GateColors.textPrimary },
  stateCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderStyle: 'dashed',
    borderRadius: GateRadius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
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
