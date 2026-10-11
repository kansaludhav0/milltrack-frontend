/**
 * Paper log — the paper register as a sheet. One grid per day, one row per
 * count + client/colour + cone type + bobbin colour, with the four cone counts
 * typed straight into the cells (loose, packed, dispatched today, closing).
 * Kept for reference only: it never feeds any other figure.
 *
 * Saving a row again overwrites it, so a mistake is fixed by editing the cell
 * and saving. Rows cannot be deleted.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { DateStepper, PackagingHeader } from '@/components/packaging/PackagingHeader';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { finalizePackagingDayApi, getLookupsApi, getPaperLogApi, putPaperLogApi } from '@/lib/api';
import { coneTypeShort } from '@/lib/cone';
import { formatShiftDate, toISODate } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import type { PaperLogOut } from '@/lib/types';

type Field = 'loose' | 'packed' | 'dispatched' | 'closing';
type Vals = Record<Field, string>;
interface Spec {
  count_id: string;
  palli_id: string;
  cone_type_id: string;
  bobbin_colour_id: string;
}

const COLS: { key: Field; label: string }[] = [
  { key: 'loose', label: 'Loose' },
  { key: 'packed', label: 'Packed' },
  { key: 'dispatched', label: 'Out today' },
  { key: 'closing', label: 'Closing' },
];
const BLANK: Vals = { loose: '', packed: '', dispatched: '', closing: '' };
const specKey = (s: Spec) => `${s.count_id}|${s.palli_id}|${s.cone_type_id}|${s.bobbin_colour_id}`;
const fromServer = (r: PaperLogOut): Vals => ({
  loose: String(r.loose_cones),
  packed: String(r.packed_cones),
  dispatched: String(r.dispatched_cones),
  closing: String(r.closing_cones),
});
const isInt = (t: string) => /^\d+$/.test(t);
const fmt = (v: number | string) => (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function PaperLogScreen() {
  const [date, setDate] = useState(() => toISODate(new Date()));
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PackagingHeader />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Remounting per day drops unsaved edits from another day */}
        <PaperSheet key={date} date={date} onDateChange={setDate} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function PaperSheet({ date, onDateChange }: { date: string; onDateChange: (d: string) => void }) {
  const qc = useQueryClient();
  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });
  const logKey = ['pkg-paper-log', date] as const;
  const logQuery = useQuery({ queryKey: logKey, queryFn: () => getPaperLogApi(date) });

  const counts = lookups?.yarn_counts ?? [];
  const pallis = lookups?.pallis ?? [];
  const cones = lookups?.cone_types ?? [];
  const bobbins = lookups?.bobbin_colours ?? [];
  const countLabel = (id: string) => counts.find((c) => c.id === id)?.label ?? '';
  const palliName = (id: string) => pallis.find((p) => p.id === id)?.display_name ?? '';
  const bobbinName = (id: string) => bobbins.find((b) => b.id === id)?.name ?? '';
  const cone = (id: string) => cones.find((c) => c.id === id);

  const [drafts, setDrafts] = useState<Record<string, Vals>>({}); // typed values by row
  const [added, setAdded] = useState<Spec[]>([]); // rows added in this session, not saved yet
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<Partial<Spec>>({});
  const [focusKey, setFocusKey] = useState<string | null>(null); // row just added: its first cell takes focus
  const [pickError, setPickError] = useState<string | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });

  const server = useMemo(() => (Array.isArray(logQuery.data) ? logQuery.data : []), [logQuery.data]);
  const serverByKey = useMemo(() => new Map(server.map((r) => [specKey(r), r])), [server]);

  // The sheet: rows saved on the server for this day + rows added here
  const rows = useMemo(() => {
    const list: { key: string; spec: Spec; saved: PaperLogOut | null }[] = server.map((r) => ({ key: specKey(r), spec: r, saved: r }));
    added.forEach((s) => {
      if (!serverByKey.has(specKey(s))) list.push({ key: specKey(s), spec: s, saved: null });
    });
    return list.sort(
      (a, b) =>
        countLabel(a.spec.count_id).localeCompare(countLabel(b.spec.count_id), undefined, { numeric: true }) ||
        palliName(a.spec.palli_id).localeCompare(palliName(b.spec.palli_id)) ||
        bobbinName(a.spec.bobbin_colour_id).localeCompare(bobbinName(b.spec.bobbin_colour_id))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [server, added, serverByKey, lookups]);

  const valsOf = (r: (typeof rows)[number]): Vals => drafts[r.key] ?? (r.saved ? fromServer(r.saved) : BLANK);
  const isDirty = (r: (typeof rows)[number]) => {
    const d = drafts[r.key];
    if (!d) return false;
    if (!r.saved) return COLS.some((c) => d[c.key] !== '');
    const s = fromServer(r.saved);
    return COLS.some((c) => d[c.key] !== s[c.key]);
  };
  const dirtyRows = rows.filter(isDirty);

  const setCell = (key: string, saved: PaperLogOut | null, field: Field, text: string) => {
    setDrafts((d) => ({ ...d, [key]: { ...(d[key] ?? (saved ? fromServer(saved) : BLANK)), [field]: text.replace(/[^0-9]/g, '') } }));
    setErrors((e) => (e[key] ? { ...e, [key]: '' } : e));
    setFormError(null);
  };

  // Totals row, like the one at the bottom of the paper
  const totals = COLS.map((c) => rows.reduce((s, r) => s + (parseInt(valsOf(r)[c.key], 10) || 0), 0));

  // Soft checks (never block saving: this is what the paper says)
  const hints: string[] = [];
  rows.forEach((r) => {
    const v = valsOf(r);
    if (!COLS.every((c) => isInt(v[c.key]))) return;
    const [l, p, d, c] = COLS.map((x) => parseInt(v[x.key], 10));
    const name = `${countLabel(r.spec.count_id)} · ${palliName(r.spec.palli_id)}`;
    if (c !== l + p - d) hints.push(`${name}: closing is usually loose + packed − out = ${fmt(l + p - d)}.`);
    const ct = cone(r.spec.cone_type_id);
    if (ct && p % ct.bundle_count !== 0) hints.push(`${name}: packed cones are normally whole bags (multiples of ${ct.bundle_count}).`);
  });

  const save = useMutation({
    mutationFn: async (toSave: typeof rows) => {
      const failed: Record<string, string> = {};
      for (const r of toSave) {
        const v = valsOf(r);
        try {
          await putPaperLogApi({
            log_date: date,
            count_id: r.spec.count_id,
            palli_id: r.spec.palli_id,
            cone_type_id: r.spec.cone_type_id,
            bobbin_colour_id: r.spec.bobbin_colour_id,
            loose_cones: parseInt(v.loose, 10),
            packed_cones: parseInt(v.packed, 10),
            dispatched_cones: parseInt(v.dispatched, 10),
            closing_cones: parseInt(v.closing, 10),
          });
        } catch (e) {
          failed[r.key] = (e as Error).message || 'Could not save';
        }
      }
      return failed;
    },
    onSuccess: async (failed, toSave) => {
      await qc.invalidateQueries({ queryKey: logKey });
      const okKeys = toSave.map((r) => r.key).filter((k) => !failed[k]);
      setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => !okKeys.includes(k))));
      setAdded((a) => a.filter((s) => !okKeys.includes(specKey(s))));
      setErrors(failed);
      const bad = Object.keys(failed).length;
      if (bad > 0) setFormError(`${bad} ${bad === 1 ? 'row' : 'rows'} could not be saved. They are marked in red.`);
      setToast({
        visible: true,
        message: okKeys.length > 0 ? `${okKeys.length} ${okKeys.length === 1 ? 'row' : 'rows'} saved` : 'Nothing was saved',
        type: okKeys.length > 0 ? 'success' : 'error',
      });
    },
  });

  // End of day: freeze this day's paper log into a permanent Packaging Sheet for Admin
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const finalize = useMutation({
    mutationFn: () => finalizePackagingDayApi(date),
    onSuccess: (f) => {
      setFinalizeOpen(false);
      setFinalizedAt(f.finalized_at);
      setToast({ visible: true, message: `Packaging sheet for ${formatShiftDate(date)} finalized`, type: 'success' });
    },
    onError: (e: Error) => {
      setFinalizeOpen(false);
      setToast({ visible: true, message: e.message || 'Could not finalize the sheet.', type: 'error' });
    },
  });
  const isToday = date === toISODate(new Date());

  const saveSheet = () => {
    setFormError(null);
    const bad: Record<string, string> = {};
    dirtyRows.forEach((r) => {
      const v = valsOf(r);
      if (!COLS.every((c) => isInt(v[c.key]))) bad[r.key] = 'Fill all four numbers (0 if none)';
    });
    setErrors(bad);
    if (Object.keys(bad).length > 0) return setFormError('Every changed row needs all four numbers. Use 0 where there is none.');
    save.mutate(dirtyRows);
  };

  const addRow = () => {
    setPickError(null);
    const { count_id, palli_id, cone_type_id, bobbin_colour_id } = pick;
    if (!count_id || !palli_id || !cone_type_id || !bobbin_colour_id) return setPickError('Choose all four: count, client + colour, cone type and bobbin colour.');
    const spec = { count_id, palli_id, cone_type_id, bobbin_colour_id };
    if (rows.some((r) => r.key === specKey(spec))) return setPickError('That row is already on the sheet.');
    setAdded((a) => [...a, spec]);
    setFocusKey(specKey(spec));
    setDrafts((d) => ({ ...d, [specKey(spec)]: { ...BLANK } }));
    setPick({ count_id }); // keep the count: paper rows come grouped by count
    setAdding(false);
  };

  const removeAdded = (key: string) => {
    setAdded((a) => a.filter((s) => specKey(s) !== key));
    setDrafts((d) => Object.fromEntries(Object.entries(d).filter(([k]) => k !== key)));
  };

  return (
    <>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.page}>
          <DateStepper date={date} onChange={onDateChange} />
          <Text style={styles.caption}>
            Type what the paper register says, in whole cones. It is kept for reference and does not change any other figures.
          </Text>

          {logQuery.isLoading ? (
            <ActivityIndicator size="large" color={GateColors.primary} style={{ marginTop: 28 }} />
          ) : logQuery.isError ? (
            <TouchableOpacity style={styles.stateCard} onPress={() => logQuery.refetch()}>
              <Text style={styles.stateTitle}>Could not load this day</Text>
              <Text style={styles.stateSub}>{(logQuery.error as Error)?.message ?? ''} Tap to try again.</Text>
            </TouchableOpacity>
          ) : (
            <>
              {(
                <View style={styles.grid}>
                  <View style={[styles.row, styles.headRow]}>
                    <View style={[styles.cell, styles.specCol]}>
                      <Text style={styles.th}>Count · client + colour</Text>
                    </View>
                    {COLS.map((c) => (
                      <View key={c.key} style={[styles.cell, styles.numCol]}>
                        <Text style={[styles.th, styles.center]} numberOfLines={2}>{c.label}</Text>
                      </View>
                    ))}
                  </View>

                  {rows.length === 0 ? (
                    <View style={styles.emptyRow}>
                      <Text style={styles.stateTitle}>No rows for this day yet</Text>
                      <Text style={styles.stateSub}>Tap + Add row below. The new row has four boxes to type in: Loose, Packed, Out today and Closing.</Text>
                    </View>
                  ) : null}

                  {rows.map((r) => {
                    const v = valsOf(r);
                    const dirty = isDirty(r);
                    const ct = cone(r.spec.cone_type_id);
                    return (
                      <View key={r.key} style={[styles.row, dirty && styles.rowDirty, !!errors[r.key] && styles.rowError]}>
                        <View style={[styles.cell, styles.specCol]}>
                          <Text style={styles.specMain} numberOfLines={2}>
                            {countLabel(r.spec.count_id)} · {palliName(r.spec.palli_id)}
                          </Text>
                          <Text style={styles.specSub} numberOfLines={1}>
                            {ct ? `${ct.bundle_count} cones` : ''} · {bobbinName(r.spec.bobbin_colour_id)}
                          </Text>
                          {errors[r.key] ? <Text style={styles.rowErr}>{errors[r.key]}</Text> : null}
                          {!r.saved ? (
                            <TouchableOpacity onPress={() => removeAdded(r.key)} hitSlop={8}>
                              <Text style={styles.removeText}>Remove</Text>
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        {COLS.map((c) => (
                          <View key={c.key} style={[styles.cell, styles.numCol]}>
                            <TextInput
                              style={styles.input}
                              value={v[c.key]}
                              onChangeText={(t) => setCell(r.key, r.saved, c.key, t)}
                              keyboardType="number-pad"
                              autoFocus={focusKey === r.key && c.key === 'loose'}
                              selectTextOnFocus
                              placeholder="0"
                              placeholderTextColor={GateColors.textMuted}
                              maxLength={7}
                              accessibilityLabel={`${c.label} cones for ${countLabel(r.spec.count_id)} ${palliName(r.spec.palli_id)}`}
                            />
                            {c.key === 'closing' && r.saved && !dirty ? (
                              <Text style={styles.kgEq}>≈ {fmt(r.saved.closing_kg_equivalent)} kg</Text>
                            ) : null}
                          </View>
                        ))}
                      </View>
                    );
                  })}

                  <View style={[styles.row, styles.totalRow]}>
                    <View style={[styles.cell, styles.specCol]}>
                      <Text style={styles.totalLabel}>Total cones</Text>
                    </View>
                    {totals.map((t, i) => (
                      <View key={COLS[i].key} style={[styles.cell, styles.numCol]}>
                        <Text style={styles.totalValue}>{fmt(t)}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* Add a row (inline, so it never opens a modal over another modal) */}
              {adding ? (
                <View style={styles.addCard}>
                  <Text style={styles.addTitle}>Add a row</Text>
                  <SelectField label="Count" placeholder="Select count" sheetTitle="Count" searchable={false} options={counts.map((c) => ({ id: c.id, title: c.label }))} value={pick.count_id ?? null} onChange={(id) => setPick((p) => ({ ...p, count_id: id ?? undefined }))} />
                  <SelectField label="Client + colour" placeholder="Select client + colour" sheetTitle="Client + colour" searchPlaceholder="Search" options={pallis.map((p) => ({ id: p.id, title: p.display_name }))} value={pick.palli_id ?? null} onChange={(id) => setPick((p) => ({ ...p, palli_id: id ?? undefined }))} />
                  <SelectField label="Cone type" placeholder="Select cone type" sheetTitle="Cone type" searchable={false} options={cones.map((c) => ({ id: c.id, title: coneTypeShort(c) }))} value={pick.cone_type_id ?? null} onChange={(id) => setPick((p) => ({ ...p, cone_type_id: id ?? undefined }))} />
                  <SelectField label="Bobbin colour" placeholder="Select bobbin colour" sheetTitle="Bobbin colour" searchable={false} options={bobbins.map((b) => ({ id: b.id, title: b.name }))} value={pick.bobbin_colour_id ?? null} onChange={(id) => setPick((p) => ({ ...p, bobbin_colour_id: id ?? undefined }))} />
                  {pickError ? (
                    <View style={styles.errorBox} accessibilityRole="alert">
                      <Text style={styles.errorText}>{pickError}</Text>
                    </View>
                  ) : null}
                  <View style={styles.btnRow}>
                    <GateButton label="Cancel" variant="ghost" onPress={() => setAdding(false)} style={styles.flex1} />
                    <GateButton label="Add to sheet" onPress={addRow} style={styles.flex1} />
                  </View>
                </View>
              ) : (
                <TouchableOpacity style={styles.addBtn} onPress={() => setAdding(true)} testID="add-paper-row">
                  <Text style={styles.addBtnText}>+ Add row</Text>
                </TouchableOpacity>
              )}

              {hints.length > 0 ? (
                <View style={styles.hintBox}>
                  <Text style={styles.hintTitle}>Worth a look</Text>
                  {hints.map((h) => (
                    <Text key={h} style={styles.hintText}>{h}</Text>
                  ))}
                </View>
              ) : null}

              {formError ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{formError}</Text>
                </View>
              ) : null}

              <GateButton
                label={dirtyRows.length > 0 ? `Save sheet (${dirtyRows.length} ${dirtyRows.length === 1 ? 'row' : 'rows'} changed)` : 'Save sheet'}
                size="lg"
                loading={save.isPending}
                disabled={dirtyRows.length === 0 || save.isPending}
                onPress={saveSheet}
                testID="save-paper-sheet"
              />

              {/* End of day */}
              <View style={styles.finalizeCard}>
                <View style={styles.finalizeText}>
                  <Text style={styles.finalizeTitle}>{finalizedAt ? 'Sheet finalized' : 'End of day'}</Text>
                  <Text style={styles.finalizeSub}>
                    {finalizedAt
                      ? `Finalized ${formatDateTime(finalizedAt)}. Admin has the permanent PDF.`
                      : dirtyRows.length > 0
                        ? 'Save the sheet first. Unsaved changes would not be in the finalized sheet.'
                        : "Lock this day's paper log into a permanent sheet for Admin's records."}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[styles.finalizeBtn, (dirtyRows.length > 0 || finalize.isPending) && styles.finalizeBtnOff]}
                  disabled={dirtyRows.length > 0 || finalize.isPending}
                  onPress={() => setFinalizeOpen(true)}
                  testID="finalize-day-btn"
                >
                  <Text style={styles.finalizeBtnText}>{finalizedAt ? 'Finalize again' : isToday ? "Finalize today's sheet" : 'Finalize this day'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </ScrollView>

      <ConfirmDialog
        visible={finalizeOpen}
        title={isToday ? "Finalize today's packaging sheet?" : `Finalize ${formatShiftDate(date)}?`}
        message="This locks in the paper log for this day as a permanent sheet for Admin's records. It is one way: the day can't be reopened."
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onConfirm={() => finalize.mutate()}
        onCancel={() => setFinalizeOpen(false)}
      />

      <Toast position="top" visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
    </>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  flex: { flex: 1 },
  flex1: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 100 },
  page: { width: '100%', maxWidth: 820, alignSelf: 'center', gap: 12 },
  caption: { fontSize: 12, lineHeight: 17, color: GateColors.textMuted, textAlign: 'center' },
  grid: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface4, borderRadius: 6, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1, borderBottomColor: GateColors.surface3 },
  headRow: { backgroundColor: GateColors.surface2, borderBottomColor: GateColors.surface4 },
  rowDirty: { backgroundColor: GateColors.warningLight },
  rowError: { borderLeftWidth: 3, borderLeftColor: GateColors.danger, backgroundColor: GateColors.dangerLight },
  cell: { minWidth: 0, justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: GateColors.surface3 },
  specCol: { flex: 2.4, paddingHorizontal: 8, paddingVertical: 8, borderLeftWidth: 0, gap: 1 },
  numCol: { flex: 1, paddingHorizontal: 2, paddingVertical: 4, alignItems: 'center' },
  th: { fontSize: 11, fontWeight: '800', color: GateColors.textPrimary },
  center: { textAlign: 'center' },
  specMain: { fontSize: 12, fontWeight: '800', color: GateColors.textPrimary },
  specSub: { fontSize: 10, color: GateColors.textSecondary },
  rowErr: { fontSize: 10, fontWeight: '700', color: GateColors.danger, marginTop: 2 },
  removeText: { fontSize: 10, fontWeight: '700', color: GateColors.danger, marginTop: 3 },
  input: { width: '92%', minHeight: 40, textAlign: 'center', fontSize: 15, fontWeight: '700', color: GateColors.textPrimary, paddingHorizontal: 2, backgroundColor: GateColors.surface0, borderWidth: 1, borderColor: GateColors.surface4, borderRadius: GateRadius.sm },
  kgEq: { fontSize: 9, color: GateColors.textMuted },
  totalRow: { backgroundColor: GateColors.textPrimary, borderBottomWidth: 0 },
  totalLabel: { fontSize: 12, fontWeight: '800', color: GateColors.onPrimary },
  totalValue: { fontSize: 13, fontWeight: '800', color: GateColors.onPrimary, textAlign: 'center' },
  emptyRow: { padding: 22, alignItems: 'center', gap: 4, borderBottomWidth: 1, borderBottomColor: GateColors.surface3 },
  finalizeCard: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 14 },
  finalizeText: { flex: 1, minWidth: 0, gap: 2 },
  finalizeTitle: { fontSize: 14, fontWeight: '700', color: GateColors.textPrimary },
  finalizeSub: { fontSize: 12, lineHeight: 17, color: GateColors.textSecondary },
  finalizeBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: GateRadius.md, borderWidth: 1.5, borderColor: GateColors.primary, backgroundColor: GateColors.surface1 },
  finalizeBtnOff: { opacity: 0.4 },
  finalizeBtnText: { fontSize: 13, fontWeight: '700', color: GateColors.primary, textAlign: 'center' },
  addBtn: { minHeight: 46, alignItems: 'center', justifyContent: 'center', borderRadius: GateRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: GateColors.primary, backgroundColor: GateColors.surface1 },
  addBtnText: { fontSize: 14, fontWeight: '700', color: GateColors.primary },
  addCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 14, gap: 12 },
  addTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
  btnRow: { flexDirection: 'row', gap: 10 },
  hintBox: { backgroundColor: GateColors.surface2, borderRadius: GateRadius.md, padding: 12, gap: 4 },
  hintTitle: { fontSize: 12, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase' },
  hintText: { fontSize: 12, lineHeight: 17, color: GateColors.textSecondary },
  errorBox: { backgroundColor: GateColors.dangerLight, borderWidth: 1, borderColor: GateColors.danger, borderRadius: GateRadius.md, padding: 12 },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  stateCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 24, alignItems: 'center', gap: 4 },
  stateTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center' },
});
