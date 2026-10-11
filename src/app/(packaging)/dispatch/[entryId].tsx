/**
 * One vehicle's dispatch: open it, declare what should go (count + client/colour
 * + bag count), then assign specific packed bags to each line.
 *
 * Everything shown comes from the server, so reopening this screen (after a
 * restart, or on another device) picks the dispatch up exactly where it was left.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { useDispatchesByEntry } from '@/components/packaging/useDispatches';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  addDispatchLineApi,
  assignBagApi,
  createDispatchApi,
  getAvailableBagsApi,
  getDispatchApi,
  getLoadingVehiclesApi,
  getLookupsApi,
} from '@/lib/api';
import { goBack } from '@/lib/navigation';
import type { DispatchLineOut, PackagingRecordOut } from '@/lib/types';

const kg = (v: string | number) => (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export default function DispatchDetailScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const qc = useQueryClient();

  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') => setToast({ visible: true, message, type });

  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });
  const vehiclesQuery = useQuery({ queryKey: ['pkg-loading-vehicles'], queryFn: getLoadingVehiclesApi });
  const vehicle = (Array.isArray(vehiclesQuery.data) ? vehiclesQuery.data : []).find((v) => (v.gate_entry_id || v.id) === entryId);

  // Find this vehicle's dispatch on the server, then read its full state
  const { byEntry, isLoading: dispatchesLoading } = useDispatchesByEntry();
  const [createdId, setCreatedId] = useState<string | null>(null);
  const dispatchId = byEntry.get(entryId)?.id ?? createdId;
  const detailKey = ['pkg-dispatch', dispatchId] as const;
  const detail = useQuery({ queryKey: detailKey, queryFn: () => getDispatchApi(dispatchId!), enabled: !!dispatchId });
  const dispatch = detail.data?.dispatch ?? null;
  const lines = detail.data?.lines ?? [];
  const bags = detail.data?.bags ?? [];

  const counts = lookups?.yarn_counts ?? [];
  const pallis = lookups?.pallis ?? [];
  const parties = lookups?.parties ?? [];
  const countLabel = (id: string) => counts.find((c) => c.id === id)?.label ?? '';
  const palliName = (id: string) => pallis.find((p) => p.id === id)?.display_name ?? '';
  const doneFor = (line: DispatchLineOut) => bags.filter((b) => b.dispatch_line_id === line.id).length;
  const refreshDispatch = () => {
    qc.invalidateQueries({ queryKey: detailKey });
    qc.invalidateQueries({ queryKey: ['pkg-available'] });
    qc.invalidateQueries({ queryKey: ['pkg-packed-today'] });
  };

  // ─── Step 1: open the dispatch ─────────────────────────────────────────────
  const [partyId, setPartyId] = useState<string | null>(null);
  const newId = useRef<string | null>(null); // stable, so a retried tap cannot open two dispatches
  const effectiveParty = partyId ?? vehicle?.party_id ?? null;
  const open = useMutation({
    mutationFn: () => {
      newId.current ??= uuid.v4() as string;
      return createDispatchApi({ id: newId.current, gate_entry_id: entryId, party_id: effectiveParty! });
    },
    onSuccess: (d) => {
      setCreatedId(d.id);
      qc.invalidateQueries({ queryKey: ['pkg-dispatches'] });
      showToast(`${d.dispatch_code} opened`);
    },
    onError: (e: Error) => showToast(e.message || 'Could not open the dispatch.', 'error'),
  });

  // ─── Step 2: add lines ─────────────────────────────────────────────────────
  const [lCount, setLCount] = useState<string | null>(null);
  const [lPalli, setLPalli] = useState<string | null>(null);
  const [lBags, setLBags] = useState('');
  const [lWeight, setLWeight] = useState('');
  const [lineError, setLineError] = useState<string | null>(null);
  const addLine = useMutation({
    mutationFn: () =>
      addDispatchLineApi(dispatch!.id, {
        count_id: lCount!,
        palli_id: lPalli!,
        bag_count: parseInt(lBags, 10),
        approx_weight_kg: lWeight ? parseFloat(lWeight).toFixed(2) : null,
      }),
    onSuccess: () => {
      refreshDispatch();
      setLBags('');
      setLWeight('');
      setLineError(null);
    },
    onError: (e: Error) => setLineError(e.message || 'Could not add the line.'),
  });
  const submitLine = () => {
    setLineError(null);
    if (!lCount) return setLineError('Choose the count.');
    if (!lPalli) return setLineError('Choose the client + colour.');
    if (!/^\d+$/.test(lBags) || parseInt(lBags, 10) <= 0) return setLineError('Enter how many bags (a whole number).');
    addLine.mutate();
  };

  // ─── Step 3: assign packed bags (from ANY day) to a line ───────────────────
  const [pickLine, setPickLine] = useState<DispatchLineOut | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const available = useQuery({
    queryKey: ['pkg-available', pickLine?.count_id, pickLine?.palli_id],
    queryFn: () => getAvailableBagsApi({ count_id: pickLine!.count_id, palli_id: pickLine!.palli_id }),
    enabled: !!pickLine,
  });
  const candidates: PackagingRecordOut[] = Array.isArray(available.data) ? available.data : [];
  const remaining = pickLine ? Math.max(0, pickLine.bag_count - doneFor(pickLine)) : 0;

  const assign = useMutation({
    mutationFn: async ({ line, picks }: { line: DispatchLineOut; picks: PackagingRecordOut[] }) => {
      for (const b of picks) await assignBagApi(line.id, b.id);
    },
    onSuccess: () => {
      setPickError(null);
      refreshDispatch();
    },
    onError: (e: Error) => {
      // 409 means the bag was already dispatched: refreshing drops it from the list
      setPickError(e.message || 'Could not assign the bag.');
      refreshDispatch();
    },
  });

  const totalBags = lines.reduce((s, l) => s + l.bag_count, 0);
  const totalDone = bags.length;
  const loadingState = vehiclesQuery.isLoading || dispatchesLoading || (!!dispatchId && detail.isLoading);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack('/(packaging)/dispatch')} style={styles.backBtn} accessibilityLabel="Back">
          <Text style={styles.backText}>← Vehicles</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{vehicle?.vehicle_number ?? 'Dispatch'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            {loadingState ? (
              <ActivityIndicator size="large" color={GateColors.primary} style={{ marginTop: 40 }} />
            ) : detail.isError ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Could not load this dispatch</Text>
                <Text style={styles.sub}>{(detail.error as Error)?.message ?? 'Something went wrong.'}</Text>
                <GateButton label="Try again" onPress={() => detail.refetch()} />
              </View>
            ) : !vehicle && !dispatch ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Vehicle not found</Text>
                <Text style={styles.sub}>It may have left, or it is no longer a loading vehicle.</Text>
              </View>
            ) : !dispatch ? (
              /* Step 1 */
              <View style={styles.card}>
                <Text style={styles.cardTitle}>Open dispatch</Text>
                <Text style={styles.sub}>
                  {vehicle?.vehicle_number} · {vehicle?.entry_code}
                  {vehicle?.driver_name ? ` · ${vehicle.driver_name}` : ''}
                </Text>
                <SelectField
                  label="Client"
                  placeholder="Select client"
                  sheetTitle="Client"
                  searchPlaceholder="Search"
                  options={parties.map((p) => ({ id: p.id, title: p.name }))}
                  value={effectiveParty}
                  onChange={setPartyId}
                />
                <GateButton label="Open dispatch" size="lg" disabled={!effectiveParty} loading={open.isPending} onPress={() => open.mutate()} testID="open-dispatch-btn" />
              </View>
            ) : (
              <>
                <View style={styles.summary}>
                  <Text style={styles.summaryCode}>{dispatch.dispatch_code}</Text>
                  <Text style={styles.summarySub}>
                    {totalBags > 0 ? `${totalDone} of ${totalBags} bags assigned` : 'Add what should go on this vehicle'}
                  </Text>
                </View>

                {lines.map((l) => {
                  const done = doneFor(l);
                  const complete = done >= l.bag_count;
                  const lineBags = bags.filter((b) => b.dispatch_line_id === l.id);
                  return (
                    <View key={l.id} style={styles.lineCard}>
                      <View style={styles.lineTop}>
                        <View style={styles.lineText}>
                          <Text style={styles.lineTitle} numberOfLines={1}>{countLabel(l.count_id)} · {palliName(l.palli_id)}</Text>
                          <Text style={styles.lineSub}>
                            {l.bag_count} {l.bag_count === 1 ? 'bag' : 'bags'}
                            {l.approx_weight_kg ? ` · about ${kg(l.approx_weight_kg)} kg` : ''}
                          </Text>
                        </View>
                        <Text style={[styles.progress, complete && styles.progressDone]}>{done}/{l.bag_count}</Text>
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, { width: `${Math.min(100, (done / l.bag_count) * 100)}%` }, complete && styles.fillDone]} />
                      </View>
                      {lineBags.length > 0 ? (
                        <Text style={styles.bagList} numberOfLines={3}>
                          {lineBags.map((b) => `${b.bag_code} (${kg(b.net_weight_kg)} kg)`).join(' · ')}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        style={[styles.assignBtn, complete && styles.assignDisabled]}
                        disabled={complete}
                        onPress={() => {
                          setPickError(null);
                          setPickLine(l);
                        }}
                      >
                        <Text style={styles.assignText}>{complete ? 'All bags assigned' : 'Assign bags'}</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                <View style={styles.card}>
                  <Text style={styles.cardTitle}>Add a line</Text>
                  <SelectField label="Count" placeholder="Select count" sheetTitle="Count" searchable={false} options={counts.map((c) => ({ id: c.id, title: c.label }))} value={lCount} onChange={setLCount} />
                  <SelectField label="Client + colour" placeholder="Select client + colour" sheetTitle="Client + colour" searchPlaceholder="Search" options={pallis.map((p) => ({ id: p.id, title: p.display_name }))} value={lPalli} onChange={setLPalli} />
                  <View style={styles.row2}>
                    <View style={styles.col}>
                      <Text style={styles.label}>Bags</Text>
                      <TextInput style={styles.input} value={lBags} onChangeText={(t) => setLBags(t.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="0" placeholderTextColor={GateColors.textMuted} accessibilityLabel="Number of bags" />
                    </View>
                    <View style={styles.col}>
                      <Text style={styles.label}>Approx kg <Text style={styles.optional}>optional</Text></Text>
                      <TextInput style={styles.input} value={lWeight} onChangeText={(t) => setLWeight(t.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={GateColors.textMuted} accessibilityLabel="Approximate weight in kilograms" />
                    </View>
                  </View>
                  {lineError ? (
                    <View style={styles.errorBox} accessibilityRole="alert">
                      <Text style={styles.errorText}>{lineError}</Text>
                    </View>
                  ) : null}
                  <GateButton label="Add line" loading={addLine.isPending} onPress={submitLine} testID="add-line-btn" />
                </View>

                <TouchableOpacity style={styles.doneBtn} onPress={() => router.replace('/(packaging)/dispatch' as never)}>
                  <Text style={styles.doneText}>Back to vehicles</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Bag picker */}
      <Modal visible={!!pickLine} transparent animationType="slide" onRequestClose={() => setPickLine(null)}>
        <View style={styles.modalRoot}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <View style={styles.lineText}>
                <Text style={styles.sheetTitle}>Assign bags</Text>
                {pickLine ? (
                  <Text style={styles.lineSub}>
                    {countLabel(pickLine.count_id)} · {palliName(pickLine.palli_id)} · {remaining} still needed
                  </Text>
                ) : null}
              </View>
              <TouchableOpacity onPress={() => setPickLine(null)} hitSlop={12}>
                <Text style={styles.close}>Done</Text>
              </TouchableOpacity>
            </View>
            {pickError ? (
              <View style={[styles.errorBox, { marginHorizontal: 16 }]} accessibilityRole="alert">
                <Text style={styles.errorText}>{pickError}</Text>
              </View>
            ) : null}
            {pickLine && candidates.length > 0 && remaining > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingTop: 10 }}>
                <GateButton
                  label={`Assign next ${Math.min(remaining, candidates.length)}`}
                  loading={assign.isPending}
                  onPress={() => assign.mutate({ line: pickLine, picks: candidates.slice(0, remaining) })}
                />
              </View>
            ) : null}
            <ScrollView style={styles.sheetList} keyboardShouldPersistTaps="handled">
              {available.isLoading ? (
                <ActivityIndicator size="small" color={GateColors.primary} style={{ margin: 24 }} />
              ) : candidates.length === 0 ? (
                <Text style={styles.sheetEmpty}>
                  {remaining === 0 ? 'All the bags for this line are assigned.' : 'No unassigned packed bags match this count and client + colour.'}
                </Text>
              ) : (
                candidates.map((b) => (
                  <TouchableOpacity
                    key={b.id}
                    style={styles.bagRow}
                    disabled={remaining === 0 || assign.isPending}
                    onPress={() => pickLine && assign.mutate({ line: pickLine, picks: [b] })}
                  >
                    <View style={styles.lineText}>
                      <Text style={styles.bagCode}>{b.bag_code}</Text>
                      <Text style={styles.lineSub}>{kg(b.net_weight_kg)} kg packed</Text>
                    </View>
                    <Text style={styles.bagAdd}>Add</Text>
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Toast position="top" visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: GateColors.surface1, borderBottomWidth: 1, borderBottomColor: GateColors.surface3 },
  backBtn: { paddingVertical: 6, width: 90 },
  backText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  headerTitle: { fontSize: 17, fontWeight: '800', color: GateColors.textPrimary, flexShrink: 1 },
  headerSpacer: { width: 90 },
  scroll: { padding: 12, paddingBottom: 80 },
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
  card: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 16, gap: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  sub: { fontSize: 13, color: GateColors.textSecondary },
  summary: { backgroundColor: GateColors.textPrimary, borderRadius: GateRadius.md, paddingVertical: 14, paddingHorizontal: 16 },
  summaryCode: { fontSize: 18, fontWeight: '800', color: GateColors.onPrimary },
  summarySub: { fontSize: 12, color: GateColors.surface4, marginTop: 2 },
  lineCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 14, gap: 10 },
  lineTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  lineText: { flex: 1, minWidth: 0 },
  lineTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
  lineSub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  progress: { fontSize: 16, fontWeight: '800', color: GateColors.textPrimary },
  progressDone: { color: GateColors.success },
  track: { height: 6, borderRadius: 3, backgroundColor: GateColors.surface3, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3, backgroundColor: GateColors.primary },
  fillDone: { backgroundColor: GateColors.success },
  bagList: { fontSize: 11, lineHeight: 16, color: GateColors.textSecondary },
  assignBtn: { minHeight: 42, alignItems: 'center', justifyContent: 'center', borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  assignDisabled: { backgroundColor: GateColors.surface3 },
  assignText: { fontSize: 14, fontWeight: '700', color: GateColors.onPrimary },
  row2: { flexDirection: 'row', gap: 12 },
  col: { flex: 1, gap: 6, minWidth: 0 },
  label: { fontSize: 12, fontWeight: '600', color: GateColors.textSecondary, letterSpacing: 0.4, textTransform: 'uppercase' },
  optional: { fontSize: 10, fontStyle: 'italic', fontWeight: '500', textTransform: 'none', color: GateColors.textMuted },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: GateColors.surface4, borderRadius: GateRadius.md, paddingHorizontal: 12, fontSize: 17, fontWeight: '700', color: GateColors.textPrimary, backgroundColor: GateColors.surface2 },
  errorBox: { backgroundColor: GateColors.dangerLight, borderWidth: 1, borderColor: GateColors.danger, borderRadius: GateRadius.md, padding: 12 },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  doneBtn: { alignItems: 'center', paddingVertical: 12 },
  doneText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  modalRoot: { flex: 1, backgroundColor: GateColors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: { width: '100%', maxWidth: 560, maxHeight: '80%', backgroundColor: GateColors.surface1, borderTopLeftRadius: GateRadius.xl, borderTopRightRadius: GateRadius.xl, paddingBottom: 16 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  close: { fontSize: 15, fontWeight: '700', color: GateColors.primary },
  sheetList: { flexGrow: 0, paddingTop: 6 },
  sheetEmpty: { padding: 24, textAlign: 'center', fontSize: 13, lineHeight: 18, color: GateColors.textSecondary },
  bagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 13, borderTopWidth: 1, borderTopColor: GateColors.surface3 },
  bagCode: { fontSize: 15, fontWeight: '800', color: GateColors.textPrimary },
  bagAdd: { fontSize: 14, fontWeight: '700', color: GateColors.primary },
});
