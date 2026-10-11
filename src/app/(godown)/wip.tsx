/**
 * Mixing sheet — the blow-room master view for one mixing lot.
 *
 * Columns come straight from lookups.mixing_categories (already ordered):
 *   FIBRE columns hold scanned bales, grouped in party boxes (net kg only);
 *   WASTE columns hold typed-in own waste.
 * All columns share the full width, so nothing scrolls sideways.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { NavigationBar } from '@/components/navigation-bar';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  addWasteApi,
  completeMixingLotApi,
  getLookupsApi,
  getMixingLotDetailApi,
  getMixingLotsApi,
  removeWasteApi,
  unscanBaleApi,
} from '@/lib/api';
import type { MixingScanRowOut, WasteOut } from '@/lib/types';

const num = (v: string | number | undefined | null) => (typeof v === 'number' ? v : parseFloat(v ?? '') || 0);
const kg = (v: string | number | undefined | null, d = 1) =>
  num(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });

type Confirm = {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  run: () => void;
};

export default function MixingSheetScreen() {
  const qc = useQueryClient();
  const { lot: lotParam } = useLocalSearchParams<{ lot?: string }>();

  // ─── Data ──────────────────────────────────────────────────────────────────
  const lotsQuery = useQuery({ queryKey: ['mixing-lots'], queryFn: getMixingLotsApi, refetchInterval: 60_000 });
  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });
  const lots = useMemo(() => (Array.isArray(lotsQuery.data) ? lotsQuery.data : []), [lotsQuery.data]);

  // The Godown Manager only works on lots that are still being built. Once a lot
  // is completed it is Admin-tracked WIP and disappears from this screen.
  const buildingLots = useMemo(() => lots.filter((l) => l.current_status === 'BUILDING'), [lots]);
  const [chosenLotId, setChosenLotId] = useState<string | null>(null);
  const lot = buildingLots.find((l) => l.id === (chosenLotId ?? lotParam)) ?? buildingLots[0];

  const detail = useQuery({
    queryKey: ['mixing-lot-detail', lot?.id],
    queryFn: () => getMixingLotDetailApi(lot!.id),
    enabled: !!lot,
    refetchInterval: 30_000,
  });
  const categories = useMemo(
    () => [...(lookups?.mixing_categories ?? [])].sort((a, b) => a.sort_order - b.sort_order),
    [lookups]
  );
  const scans: MixingScanRowOut[] = useMemo(
    () => (Array.isArray(detail.data?.bales) ? detail.data!.bales : []),
    [detail.data]
  );
  const waste: WasteOut[] = useMemo(
    () => (Array.isArray(detail.data?.waste) ? detail.data!.waste : []),
    [detail.data]
  );
  const recipe = detail.data?.recipe ?? [];

  const columnKg = (catId: string, kind: string) =>
    kind === 'WASTE'
      ? waste.reduce((s, w) => s + num(w.weight_kg), 0)
      : scans.filter((s) => s.mixing_category_id === catId).reduce((s, x) => s + num(x.net_weight_kg), 0);
  const batchTotal =
    scans.reduce((s, x) => s + num(x.net_weight_kg), 0) + waste.reduce((s, w) => s + num(w.weight_kg), 0);

  // ─── Feedback ──────────────────────────────────────────────────────────────
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });
  const [confirm, setConfirm] = useState<Confirm | null>(null);

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['mixing-lots'] });
    qc.invalidateQueries({ queryKey: ['mixing-lot-detail'] });
    qc.invalidateQueries({ queryKey: ['godown-stock-bales'] });
    qc.invalidateQueries({ queryKey: ['godown-inventory'] });
  };

  // ─── Mutations ─────────────────────────────────────────────────────────────
  const unscan = useMutation({
    mutationFn: (scan: MixingScanRowOut) => unscanBaleApi(lot!.id, scan.id),
    onSuccess: (_r, scan) => {
      refreshAll();
      showToast(`${scan.bale_code} returned to godown`);
    },
    onError: (e: Error) => showToast(e.message || 'Could not return the bale.', 'error'),
  });

  const removeWaste = useMutation({
    mutationFn: (w: WasteOut) => removeWasteApi(lot!.id, w.id),
    onSuccess: () => {
      refreshAll();
      showToast('Waste entry removed');
    },
    onError: (e: Error) => showToast(e.message || 'Could not remove the waste entry.', 'error'),
  });

  // The one lot action: mark the lot complete (it becomes Admin-tracked WIP)
  const completeLot = useMutation({
    mutationFn: () => completeMixingLotApi(lot!.id),
    onSuccess: () => {
      const code = lot?.lot_code;
      setChosenLotId(null);
      refreshAll();
      showToast(`${code} marked complete and sent to production`);
    },
    onError: (e: Error) => {
      refreshAll(); // e.g. someone else just changed the lot
      showToast(e.message || 'Could not complete the lot.', 'error'); // shown as-is
    },
  });

  // ─── Waste modal ───────────────────────────────────────────────────────────
  const [wasteOpen, setWasteOpen] = useState(false);
  const [wasteKg, setWasteKg] = useState('');
  const [wasteNote, setWasteNote] = useState('');
  const [wasteError, setWasteError] = useState<string | null>(null);

  const addWaste = useMutation({
    mutationFn: () =>
      addWasteApi(lot!.id, {
        id: uuid.v4() as string,
        weight_kg: parseFloat(wasteKg).toFixed(3),
        note: wasteNote.trim() || null,
      }),
    onSuccess: () => {
      refreshAll();
      setWasteOpen(false);
      setWasteKg('');
      setWasteNote('');
      showToast('Waste added');
    },
    onError: (e: Error) => {
      refreshAll();
      setWasteError(e.message || 'Could not add the waste.');
    },
  });

  const submitWaste = () => {
    const v = parseFloat(wasteKg);
    if (!isFinite(v) || v <= 0) return setWasteError('Enter the waste weight in kg.');
    setWasteError(null);
    addWaste.mutate();
  };

  // ─── Confirm helpers ───────────────────────────────────────────────────────
  const askReturn = (s: MixingScanRowOut) =>
    setConfirm({
      title: `Return ${s.bale_code} to godown?`,
      message: `${kg(s.net_weight_kg)} kg from ${s.party_name} will go back to godown stock.`,
      confirmLabel: 'Return bale',
      run: () => unscan.mutate(s),
    });
  const askRemoveWaste = (w: WasteOut) =>
    setConfirm({
      title: 'Remove this waste entry?',
      message: `${kg(w.weight_kg)} kg${w.note ? ` (${w.note})` : ''} will be deleted from this lot.`,
      confirmLabel: 'Remove',
      danger: true,
      run: () => removeWaste.mutate(w),
    });

  const target = num(lot?.target_weight_kg);
  const pct = target > 0 ? Math.min(100, (num(lot?.scanned_kg) / target) * 100) : 0;
  const busy = unscan.isPending || removeWaste.isPending || completeLot.isPending;
  const hasContent = scans.length > 0 || waste.length > 0;

  const askComplete = () =>
    setConfirm({
      title: 'Mark mixing complete?',
      message: `${lot?.lot_code}: ${kg(batchTotal, 2)} kg (${scans.length} ${scans.length === 1 ? 'bale' : 'bales'}${waste.length ? ` and ${waste.length} waste ${waste.length === 1 ? 'entry' : 'entries'}` : ''}) moves to production. After this you can't add, remove or return bales.`,
      confirmLabel: 'Mixing complete',
      run: () => completeLot.mutate(),
    });

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={lotsQuery.isRefetching || detail.isRefetching}
            onRefresh={refreshAll}
            tintColor={GateColors.primary}
            colors={[GateColors.primary]}
          />
        }
      >
        <View style={styles.page}>
          <NavigationBar />

          <View style={styles.titleRow}>
            <View style={styles.titleText}>
              <Text style={styles.title}>Mixing sheet</Text>
              <Text style={styles.subtitle}>Weights issued into the lot, by column and party.</Text>
            </View>
            <TouchableOpacity style={styles.newLotBtn} onPress={() => router.push('/(godown)/new-lot' as never)}>
              <Text style={styles.newLotText}>+ New lot</Text>
            </TouchableOpacity>
          </View>

          {lotsQuery.isLoading ? (
            <ActivityIndicator size="large" color={GateColors.primary} style={styles.loader} />
          ) : lotsQuery.isError ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>Could not load mixing lots</Text>
              <Text style={styles.stateSub}>{(lotsQuery.error as Error)?.message ?? 'Something went wrong.'}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={() => lotsQuery.refetch()}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : !lot ? (
            <View style={styles.stateCard}>
              <Text style={styles.stateTitle}>No mix in progress</Text>
              <Text style={styles.stateSub}>Create a lot, then add bales to it from Godown Stock.</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => router.push('/(godown)/new-lot' as never)}
              >
                <Text style={styles.retryText}>Create a lot</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <SelectField
                label="Lot"
                placeholder="Select lot"
                sheetTitle="Select lot"
                searchable={false}
                options={buildingLots.map((l) => ({
                  id: l.id,
                  title: l.lot_code,
                  subtitle: `${kg(l.scanned_kg)} / ${kg(l.target_weight_kg)} kg`,
                }))}
                value={lot.id}
                onChange={(id) => setChosenLotId(id)}
              />

              {/* Lot summary + actions */}
              <View style={styles.summary}>
                <View style={styles.summaryTop}>
                  <Text style={styles.summaryKg}>
                    <Text style={styles.summaryStrong}>{kg(lot.scanned_kg)}</Text> / {kg(lot.target_weight_kg)} kg
                  </Text>
                </View>
                <View
                  style={styles.track}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(pct) }}
                >
                  <View style={[styles.fill, { width: `${pct}%` }]} />
                </View>
              </View>

              {/* The sheet */}
              {detail.isLoading ? (
                <ActivityIndicator size="small" color={GateColors.primary} style={styles.loader} />
              ) : detail.isError ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>Could not load this lot</Text>
                  <Text style={styles.stateSub}>{(detail.error as Error)?.message ?? 'Something went wrong.'}</Text>
                  <TouchableOpacity style={styles.retryBtn} onPress={() => detail.refetch()}>
                    <Text style={styles.retryText}>Try again</Text>
                  </TouchableOpacity>
                </View>
              ) : categories.length === 0 ? (
                <View style={styles.stateCard}>
                  <Text style={styles.stateTitle}>No mixing columns configured</Text>
                </View>
              ) : (
                <>
                  <View style={styles.grid}>
                    {/* Header */}
                    <View style={styles.row}>
                      {categories.map((c, i) => {
                        const line = recipe.find((r) => r.category === c.name);
                        return (
                          <View key={c.id} style={[styles.cell, styles.headCell, i === 0 && styles.cellFirst]}>
                            <Text style={styles.headTitle} numberOfLines={2}>
                              {i + 1}. {c.name}
                            </Text>
                            <Text style={styles.headTotal} numberOfLines={1}>
                              {kg(columnKg(c.id, c.kind))} kg
                            </Text>
                            {line ? (
                              <Text style={styles.headTarget} numberOfLines={1}>
                                of {kg(line.target_weight_kg, 0)}
                              </Text>
                            ) : null}
                            {c.kind === 'WASTE' ? (
                              <TouchableOpacity
                                style={styles.addWasteBtn}
                                onPress={() => {
                                  setWasteError(null);
                                  setWasteOpen(true);
                                }}
                                accessibilityLabel="Add own waste"
                              >
                                <Text style={styles.addWasteText}>+ Add</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>

                    {/* Body */}
                    <View style={[styles.row, styles.bodyRow]}>
                      {categories.map((c, i) => {
                        const colScans = scans.filter((s) => s.mixing_category_id === c.id);
                        const parties = [...new Set(colScans.map((s) => s.party_name || 'Unknown'))].sort();
                        return (
                          <View key={c.id} style={[styles.cell, styles.bodyCell, i === 0 && styles.cellFirst]}>
                            {c.kind === 'WASTE' ? (
                              waste.length === 0 ? (
                                <Text style={styles.empty}>–</Text>
                              ) : (
                                <View style={styles.box}>
                                  <View style={styles.boxHead}>
                                    <Text style={styles.boxTitle} numberOfLines={1}>Mill waste</Text>
                                  </View>
                                  {waste.map((w) => (
                                    <TouchableOpacity
                                      key={w.id}
                                      style={styles.boxRow}
                                      onPress={() => askRemoveWaste(w)}
                                      accessibilityLabel={`Waste ${kg(w.weight_kg)} kg`}
                                    >
                                      <Text style={styles.weight} numberOfLines={1}>{kg(w.weight_kg)} kg</Text>
                                      {w.note ? <Text style={styles.note} numberOfLines={1}>{w.note}</Text> : null}
                                    </TouchableOpacity>
                                  ))}
                                </View>
                              )
                            ) : parties.length === 0 ? (
                              <Text style={styles.empty}>–</Text>
                            ) : (
                              parties.map((party) => (
                                <View key={party} style={styles.box}>
                                  <View style={styles.boxHead}>
                                    <Text style={styles.boxTitle} numberOfLines={1}>{party}</Text>
                                  </View>
                                  {colScans
                                    .filter((s) => (s.party_name || 'Unknown') === party)
                                    .map((s) => (
                                      <TouchableOpacity
                                        key={s.id}
                                        style={styles.boxRow}
                                          onPress={() => askReturn(s)}
                                        accessibilityLabel={`${s.bale_code} ${kg(s.net_weight_kg)} kg`}
                                      >
                                        <Text style={styles.weight} numberOfLines={1}>{kg(s.net_weight_kg)} kg</Text>
                                      </TouchableOpacity>
                                    ))}
                                </View>
                              ))
                            )}
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  <View style={styles.totalBar}>
                    <Text style={styles.totalLabel}>TOTAL MIXING BATCH</Text>
                    <Text style={styles.totalValue}>{kg(batchTotal, 2)} kg</Text>
                  </View>
                  {hasContent ? (
                    <Text style={styles.hint}>Tap a weight to return that bale (or remove that waste entry).</Text>
                  ) : null}

                  <GateButton
                    label="Mixing complete"
                    size="lg"
                    loading={completeLot.isPending}
                    disabled={!hasContent || busy}
                    onPress={askComplete}
                    testID="mixing-complete-btn"
                  />
                  {!hasContent ? (
                    <Text style={styles.hint}>Add at least one bale or waste entry to complete this lot.</Text>
                  ) : null}
                </>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* Own waste */}
      <Modal visible={wasteOpen} transparent animationType="fade" onRequestClose={() => setWasteOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add own waste</Text>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Weight (kg)</Text>
              <TextInput
                style={styles.modalInput}
                value={wasteKg}
                onChangeText={(t) => setWasteKg(t.replace(/[^0-9.]/g, ''))}
                placeholder="0.0"
                placeholderTextColor={GateColors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
            <View style={styles.modalField}>
              <Text style={styles.modalLabel}>Note / source <Text style={styles.optional}>optional</Text></Text>
              <TextInput
                style={styles.modalInput}
                value={wasteNote}
                onChangeText={setWasteNote}
                placeholder="e.g. Carding droppings"
                placeholderTextColor={GateColors.textMuted}
                maxLength={200}
              />
            </View>
            {wasteError ? <Text style={styles.modalError}>{wasteError}</Text> : null}
            <View style={styles.modalBtns}>
              <GateButton label="Cancel" variant="ghost" onPress={() => setWasteOpen(false)} style={styles.flex1} />
              <GateButton label="Add" loading={addWaste.isPending} onPress={submitWaste} style={styles.flex1} />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmDialog
        visible={!!confirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmLabel={confirm?.confirmLabel}
        confirmVariant={confirm?.danger ? 'danger' : 'primary'}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const run = confirm?.run;
          setConfirm(null);
          run?.();
        }}
      />

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
  scroll: { paddingBottom: 48 },
  page: { width: '100%', maxWidth: 960, alignSelf: 'center', paddingHorizontal: 12, paddingTop: 8, gap: 12 },
  flex1: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  titleText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 22, fontWeight: '700', color: GateColors.textPrimary },
  subtitle: { fontSize: 13, color: GateColors.textSecondary },
  newLotBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: GateRadius.md,
    backgroundColor: GateColors.primary,
  },
  newLotText: { fontSize: 13, fontWeight: '700', color: GateColors.onPrimary },
  loader: { marginVertical: 32 },
  summary: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    padding: 14,
    gap: 10,
  },
  summaryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  summaryKg: { fontSize: 14, color: GateColors.textSecondary },
  summaryStrong: { fontSize: 20, fontWeight: '800', color: GateColors.textPrimary },
  pill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: GateRadius.full },
  pillText: { fontSize: 12, fontWeight: '700' },
  track: { height: 6, borderRadius: 3, backgroundColor: GateColors.surface3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: GateColors.primary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  actionPrimary: { backgroundColor: GateColors.primary, borderColor: GateColors.primary },
  actionDanger: { borderColor: GateColors.dangerLight, backgroundColor: GateColors.dangerLight },
  disabled: { opacity: 0.5 },
  actionText: { fontSize: 13, fontWeight: '600', color: GateColors.textPrimary },
  actionTextPrimary: { color: GateColors.onPrimary },
  actionTextDanger: { color: GateColors.danger },
  notice: {
    backgroundColor: GateColors.warningLight,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  noticeText: { fontSize: 13, lineHeight: 18, color: GateColors.warning },
  grid: {
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: 6,
    backgroundColor: GateColors.surface1,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row' },
  bodyRow: { minHeight: 200 },
  cell: {
    flex: 1,
    minWidth: 0,
    borderLeftWidth: 1,
    borderLeftColor: GateColors.surface4,
  },
  cellFirst: { borderLeftWidth: 0 },
  headCell: {
    paddingVertical: 8,
    paddingHorizontal: 3,
    alignItems: 'center',
    backgroundColor: GateColors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
    gap: 1,
  },
  headTitle: { fontSize: 10, fontWeight: '800', color: GateColors.textPrimary, textAlign: 'center' },
  headTotal: { fontSize: 11, fontWeight: '800', color: GateColors.primary, textAlign: 'center' },
  headTarget: { fontSize: 9, color: GateColors.textMuted, textAlign: 'center' },
  addWasteBtn: {
    marginTop: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: GateColors.primary,
  },
  addWasteText: { fontSize: 10, fontWeight: '700', color: GateColors.onPrimary },
  bodyCell: { padding: 3, gap: 5 },
  box: { borderWidth: 1, borderColor: GateColors.surface3, borderRadius: 4, overflow: 'hidden' },
  boxHead: {
    backgroundColor: GateColors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
    paddingHorizontal: 3,
    paddingVertical: 3,
  },
  boxTitle: { fontSize: 10, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  boxRow: {
    minHeight: 28,
    paddingHorizontal: 2,
    paddingVertical: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface2,
  },
  weight: { fontSize: 11, fontWeight: '600', color: GateColors.textPrimary, textAlign: 'center' },
  note: { fontSize: 9, color: GateColors.textSecondary, textAlign: 'center' },
  empty: { fontSize: 12, color: GateColors.surface4, textAlign: 'center', padding: 6 },
  totalBar: {
    backgroundColor: GateColors.textPrimary,
    borderRadius: GateRadius.md,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  totalLabel: { color: GateColors.surface4, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  totalValue: { color: GateColors.onPrimary, fontSize: 17, fontWeight: '800' },
  hint: { fontSize: 12, color: GateColors.textMuted, textAlign: 'center' },
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
  modalRoot: { flex: 1, backgroundColor: GateColors.overlay, justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 20,
    gap: 14,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  optional: { fontSize: 11, fontStyle: 'italic', fontWeight: '500', color: GateColors.textMuted },
  modalInput: {
    minHeight: 48,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    fontSize: 16,
    color: GateColors.textPrimary,
    backgroundColor: GateColors.surface1,
  },
  modalError: { fontSize: 13, fontWeight: '600', color: GateColors.danger },
  modalBtns: { flexDirection: 'row', gap: 10 },
});
