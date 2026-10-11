import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import uuid from 'react-native-uuid';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { SelectSheet } from '@/components/gate/SelectField';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { createSupervisorMachineApi, deleteSupervisorMachineApi, getShiftLogsApi, submitShiftLogsApi } from '@/lib/api';
import {
  buildShiftLog,
  EMPTY_ROW,
  PROCESS_LABEL,
  rowFromSaved,
  rowIsBlank,
  SHEET_COLUMNS,
  validateRow,
  type RowValues,
  type SheetColumn,
} from '@/lib/supervisor';
import type { ProcessType, ShiftCode, ShiftLogOut, SupervisorMachine } from '@/lib/types';

const FROZEN_W = 84;
const ACTION_W = 96;
const HEAD_H = 46;
const ROW_H = 50;

interface Props {
  processType: ProcessType;
  /** Every machine of this process type, including retired ones. */
  machines: SupervisorMachine[];
  shiftDate: string;
  shiftCode: ShiftCode;
  /** Shift already locked: only corrections to saved rows are accepted. */
  locked: boolean;
  counts: { id: string; label: string }[];
  onToast: (message: string, type: 'success' | 'error') => void;
}

const num = (t: string) => parseFloat(t) || 0;
const kg = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function ShiftSheet({ processType, machines: allMachines, shiftDate, shiftCode, locked, counts, onToast }: Props) {
  const qc = useQueryClient();
  const columns = SHEET_COLUMNS[processType];
  const hasCount = columns.some((c) => c.key === 'count_id');
  const label = PROCESS_LABEL[processType];

  const [values, setValues] = useState<Record<string, RowValues>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [correcting, setCorrecting] = useState<string | null>(null);
  const [correctionNote, setCorrectionNote] = useState('');
  const [pickFor, setPickFor] = useState<string | 'ALL' | null>(null);
  // One stable id per row so retrying a dropped request can never create duplicates.
  const rowIds = useRef<Record<string, string>>({});

  // The server returns each machine's current reading, so reopening a shift (on any device) shows it.
  const logsKey = ['shift-logs', processType, shiftDate, shiftCode] as const;
  const logsQuery = useQuery({
    queryKey: logsKey,
    queryFn: () => getShiftLogsApi(processType, shiftDate, shiftCode),
  });
  const savedRows = useMemo(() => {
    const map: Record<string, ShiftLogOut> = {};
    (Array.isArray(logsQuery.data) ? logsQuery.data : []).forEach((r) => (map[r.machine_id] = r));
    return map;
  }, [logsQuery.data]);

  const get = (id: string): RowValues => values[id] ?? EMPTY_ROW;
  const setCell = (id: string, key: keyof RowValues, text: string) => {
    setValues((v) => ({ ...v, [id]: { ...(v[id] ?? EMPTY_ROW), [key]: text } }));
    setErrors((e) => (e[id] ? { ...e, [id]: '' } : e));
    setFormError(null);
  };

  const machines = useMemo(
    () =>
      allMachines
        .filter((m) => m.is_active || !!savedRows[m.id])
        .sort((a, b) => a.display_no - b.display_no),
    [allMachines, savedRows]
  );
  const isEditing = (id: string) => !savedRows[id] || correcting === id;
  const countLabel = (id: string) => counts.find((c) => c.id === id)?.label ?? '';

  // Running subtotal of the Production column (display only, never submitted)
  const totalKg = machines.reduce((sum, m) => {
    const row = isEditing(m.id) ? get(m.id) : rowFromSaved(savedRows[m.id]);
    return sum + num(row.production_kg);
  }, 0);
  const pending = machines.filter((m) => !savedRows[m.id] && !rowIsBlank(get(m.id)));
  const savedCount = machines.filter((m) => savedRows[m.id]).length;

  const submit = useMutation({
    mutationFn: ({ rows }: { rows: ReturnType<typeof buildShiftLog>[] }) => submitShiftLogsApi(processType, rows),
    onSuccess: (out, { rows }) => {
      // Show the saved rows immediately, then confirm with the server.
      qc.setQueryData<ShiftLogOut[]>(logsKey, (old) => [
        ...(old ?? []).filter((r) => !out.some((o) => o.machine_id === r.machine_id)),
        ...out,
      ]);
      qc.invalidateQueries({ queryKey: logsKey });
      setValues((v) => {
        const copy = { ...v };
        out.forEach((o) => delete copy[o.machine_id]);
        return copy;
      });
      rows.forEach((r) => delete rowIds.current[r.machine_id]);
      setCorrecting(null);
      setCorrectionNote('');
      setFormError(null);
      onToast(
        rows.some((r) => r.correction_of_id)
          ? 'Correction saved'
          : `${label} sheet saved · ${out.length} ${out.length === 1 ? 'row' : 'rows'}`,
        'success'
      );
    },
    onError: (e: Error & { status?: number }, { rows }) => {
      const isCorrection = rows.some((r) => r.correction_of_id);
      if (e.status === 409 && !isCorrection) {
        setFormError(
          "This shift has already been submitted, so new rows can't be added. To change a reading, tap Correct on a saved row."
        );
      } else {
        setFormError(e.message || 'Could not save the sheet.');
      }
    },
  });

  const idFor = (machineId: string) => (rowIds.current[machineId] ??= uuid.v4() as string);

  const saveSheet = () => {
    const bad: Record<string, string> = {};
    pending.forEach((m) => {
      const err = validateRow(processType, get(m.id));
      if (err) bad[m.id] = err;
    });
    setErrors(bad);
    if (Object.keys(bad).length > 0) {
      setFormError('Fix the highlighted rows. The first problem is shown under each machine.');
      return;
    }
    if (pending.length === 0) return;
    setFormError(null);
    submit.mutate({
      rows: pending.map((m) =>
        buildShiftLog(
          processType,
          { id: idFor(m.id), machine_id: m.id, shift_date: shiftDate, shift_code: shiftCode },
          get(m.id)
        )
      ),
    });
  };

  const startCorrection = (m: SupervisorMachine) => {
    setValues((v) => ({ ...v, [m.id]: rowFromSaved(savedRows[m.id]) }));
    setCorrecting(m.id);
    setCorrectionNote('');
    setFormError(null);
    setErrors({});
  };

  const cancelCorrection = () => {
    setCorrecting(null);
    setCorrectionNote('');
    setFormError(null);
    setErrors({});
  };

  const saveCorrection = () => {
    const m = machines.find((x) => x.id === correcting);
    if (!m) return;
    const err = validateRow(processType, get(m.id));
    if (err) {
      setErrors({ [m.id]: err });
      setFormError('Fix the highlighted row first.');
      return;
    }
    if (!correctionNote.trim()) {
      setFormError('Add a short note saying what was wrong.');
      return;
    }
    setFormError(null);
    submit.mutate({
      rows: [
        buildShiftLog(
          processType,
          { id: uuid.v4() as string, machine_id: m.id, shift_date: shiftDate, shift_code: shiftCode },
          get(m.id),
          {
            correction_of_id: savedRows[m.id].id,
            correction_note: correctionNote.trim(),
          }
        ),
      ],
    });
  };

  // ─── Add a machine row ──────────────────────────────────────────────────────
  const lastRotor = [...allMachines].reverse().find((m) => m.rotor_count)?.rotor_count ?? null;
  const [addOpen, setAddOpen] = useState(false);
  const [rotorText, setRotorText] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const addMachine = useMutation({
    mutationFn: () =>
      createSupervisorMachineApi(processType, processType === 'OE' && rotorText ? parseInt(rotorText, 10) : undefined),
    onSuccess: (machine) => {
      qc.setQueryData<SupervisorMachine[]>(['supervisor-machines'], (old) => [...(old ?? []), machine]);
      qc.invalidateQueries({ queryKey: ['supervisor-machines'] });
      setAddOpen(false);
      onToast(`${label} machine ${machine.display_no} added`, 'success');
    },
    onError: (e: Error) => setAddError(e.message || 'Could not add the machine.'),
  });
  // Delete a machine added by mistake. The server refuses (409) once anything is recorded against it.
  const [deleteFor, setDeleteFor] = useState<SupervisorMachine | null>(null);
  const removeMachine = useMutation({
    mutationFn: (m: SupervisorMachine) => deleteSupervisorMachineApi(m.id),
    onSuccess: (_r, m) => {
      qc.setQueryData<SupervisorMachine[]>(['supervisor-machines'], (old) => (old ?? []).filter((x) => x.id !== m.id));
      qc.invalidateQueries({ queryKey: ['supervisor-machines'] });
      setDeleteFor(null);
      onToast(`${label} machine ${m.display_no} deleted`, 'success');
    },
    onError: (e: Error) => {
      setDeleteFor(null);
      onToast(e.message || 'Could not delete the machine.', 'error'); // shown plainly; the machine stays
    },
  });

  const openAdd = () => {
    setAddError(null);
    setRotorText(lastRotor ? String(lastRotor) : '');
    setAddOpen(true);
  };
  const submitAdd = () => {
    setAddError(null);
    if (processType === 'OE' && rotorText && !/^\d+$/.test(rotorText)) return setAddError('Rotor count must be a number.');
    addMachine.mutate();
  };

  if (logsQuery.isError) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Could not load this shift&apos;s readings</Text>
        <Text style={styles.emptySub}>{(logsQuery.error as Error)?.message ?? 'Something went wrong.'}</Text>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => logsQuery.refetch()}>
          <Text style={styles.bulkText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (logsQuery.isLoading) return <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 40 }} />;

  const renderCell = (m: SupervisorMachine, c: SheetColumn) => {
    const editing = isEditing(m.id);
    const blockedByLock = locked && !savedRows[m.id];
    const row = editing ? get(m.id) : rowFromSaved(savedRows[m.id]);
    const text = row[c.key];
    const cellStyle = [styles.cell, { width: c.width }, !editing && styles.cellSaved];

    if (c.kind === 'select') {
      return (
        <TouchableOpacity
          key={c.key}
          style={cellStyle}
          disabled={!editing || blockedByLock}
          onPress={() => setPickFor(m.id)}
          accessibilityLabel={`${c.label} for machine ${m.display_no}`}
        >
          <Text style={[styles.cellText, !text && styles.placeholder]} numberOfLines={1}>
            {text ? countLabel(text) || '…' : 'Select'}
          </Text>
        </TouchableOpacity>
      );
    }
    if (!editing || blockedByLock) {
      return (
        <View key={c.key} style={cellStyle}>
          <Text style={[styles.cellText, c.kind === 'text' && styles.cellTextLeft]} numberOfLines={1}>
            {text || '–'}
          </Text>
        </View>
      );
    }
    return (
      <View key={c.key} style={cellStyle}>
        <TextInput
          style={[styles.input, c.kind === 'text' && styles.inputLeft]}
          value={text}
          onChangeText={(t) =>
            setCell(
              m.id,
              c.key,
              c.kind === 'decimal' ? t.replace(/[^0-9.]/g, '') : c.kind === 'int' ? t.replace(/[^0-9]/g, '') : t
            )
          }
          keyboardType={c.kind === 'decimal' ? 'decimal-pad' : c.kind === 'int' ? 'number-pad' : 'default'}
          placeholder=""
          maxLength={c.kind === 'text' ? 200 : 9}
          accessibilityLabel={`${c.label} for machine ${m.display_no}`}
        />
      </View>
    );
  };

  return (
    <View style={styles.wrap}>
      {/* Context + bulk helpers */}
      <View style={styles.toolbar}>
        {hasCount && !locked ? (
          <TouchableOpacity style={styles.bulkBtn} onPress={() => setPickFor('ALL')}>
            <Text style={styles.bulkText}>Set count for all rows ▾</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {locked ? (
        <View style={styles.lockedBanner}>
          <Text style={styles.lockedText}>
            This shift is locked. New rows can&apos;t be added; use Correct on a saved row to change a reading.
          </Text>
        </View>
      ) : null}

      {/* The sheet: machine column stays put while the rest scrolls sideways */}
      {machines.length > 0 ? (
      <View style={styles.grid}>
        <View style={{ width: FROZEN_W }}>
          <View style={[styles.headCell, styles.frozenHead, { height: HEAD_H }]}>
            <Text style={styles.headText}>Machine</Text>
          </View>
          {machines.map((m) => (
            <View
              key={m.id}
              style={[styles.frozenCell, { height: ROW_H }, !!errors[m.id] && styles.rowError, !isEditing(m.id) && styles.cellSaved]}
            >
              <Text style={styles.machineNo}>{m.display_no}</Text>
              <Text style={styles.machineCode} numberOfLines={1}>{m.machine_code}</Text>
              {!savedRows[m.id] && m.is_active ? (
                <TouchableOpacity onPress={() => setDeleteFor(m)} hitSlop={8} accessibilityLabel={`Delete machine ${m.display_no}`}>
                  <Text style={styles.deleteText}>Delete</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scrollPart}>
          <View>
            <View style={styles.row}>
              {columns.map((c) => (
                <View key={c.key} style={[styles.headCell, { width: c.width, height: HEAD_H }]}>
                  <Text style={styles.headText} numberOfLines={2}>
                    {c.label}
                    {c.required ? ' *' : ''}
                  </Text>
                </View>
              ))}
              <View style={[styles.headCell, { width: ACTION_W, height: HEAD_H }]} />
            </View>
            {machines.map((m) => {
              const rowSaved = savedRows[m.id];
              return (
                <View key={m.id} style={[styles.row, { height: ROW_H }]}>
                  {columns.map((c) => renderCell(m, c))}
                  <View style={[styles.cell, { width: ACTION_W }, !isEditing(m.id) && styles.cellSaved]}>
                    {rowSaved && correcting !== m.id ? (
                      <View style={styles.actionBox}>
                        <TouchableOpacity style={styles.correctBtn} onPress={() => startCorrection(m)}>
                          <Text style={styles.correctText}>Correct</Text>
                        </TouchableOpacity>
                        {rowSaved.correction_of_id ? <Text style={styles.badge}>Corrected</Text> : null}
                      </View>
                    ) : correcting === m.id ? (
                      <Text style={styles.editingText}>Editing</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      </View>

      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No {label} machines yet</Text>
          <Text style={styles.emptySub}>Tap Add row to add the first {label} machine. It appears on every sheet from now on.</Text>
        </View>
      )}

      {!locked ? (
        <TouchableOpacity style={styles.addRowBtn} onPress={openAdd} testID={`add-row-${processType}`}>
          <Text style={styles.addRowText}>+ Add row</Text>
        </TouchableOpacity>
      ) : null}

      {/* Row errors */}
      {Object.entries(errors)
        .filter(([, msg]) => msg)
        .map(([id, msg]) => (
          <Text key={id} style={styles.rowErrorText}>
            Machine {machines.find((m) => m.id === id)?.display_no}: {msg}
          </Text>
        ))}

      {/* Running total, like the handwritten subtotal under each paper table */}
      {machines.length > 0 ? (
      <View style={styles.totalBar}>
        <View>
          <Text style={styles.totalLabel}>{label.toUpperCase()} PRODUCTION</Text>
          <Text style={styles.totalSub}>
            {savedCount + pending.length} of {machines.length} machines logged
          </Text>
        </View>
        <Text style={styles.totalValue}>{kg(totalKg)} kg</Text>
      </View>
      ) : null}

      {formError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      {correcting ? (
        <View style={styles.correctionBar}>
          <Text style={styles.correctionTitle}>
            Correcting machine {machines.find((m) => m.id === correcting)?.display_no}
          </Text>
          <TextInput
            style={styles.noteInput}
            value={correctionNote}
            onChangeText={(t) => {
              setCorrectionNote(t);
              setFormError(null);
            }}
            placeholder="What was wrong? e.g. mistyped production, was 730"
            placeholderTextColor={GateColors.textMuted}
            maxLength={200}
          />
          <View style={styles.btnRow}>
            <GateButton label="Cancel" variant="ghost" onPress={cancelCorrection} disabled={submit.isPending} style={styles.flex1} />
            <GateButton label="Save correction" loading={submit.isPending} onPress={saveCorrection} style={styles.flex1} />
          </View>
        </View>
      ) : (
        <GateButton
          label={
            pending.length > 0
              ? `Save ${label} sheet (${pending.length} ${pending.length === 1 ? 'row' : 'rows'})`
              : `Save ${label} sheet`
          }
          size="lg"
          loading={submit.isPending}
          disabled={pending.length === 0 || submit.isPending || locked}
          onPress={saveSheet}
          testID={`save-${processType}`}
        />
      )}

      {/* Correction history for rows saved on this device */}
      {machines.some((m) => savedRows[m.id]?.correction_of_id) ? (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>Corrections</Text>
          {machines
            .filter((m) => savedRows[m.id]?.correction_of_id)
            .map((m) => (
              <Text key={m.id} style={styles.historyLine}>
                Machine {m.display_no} · {savedRows[m.id].correction_note}
              </Text>
            ))}
        </View>
      ) : null}

      <ConfirmDialog
        visible={!!deleteFor}
        title={`Delete ${label} machine ${deleteFor?.display_no ?? ''}?`}
        message="Use this to undo a machine added by mistake. It works only while nothing has been recorded for it, and it removes the machine from every sheet."
        confirmLabel="Delete machine"
        confirmVariant="danger"
        loading={removeMachine.isPending}
        onConfirm={() => deleteFor && removeMachine.mutate(deleteFor)}
        onCancel={() => setDeleteFor(null)}
      />

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalRoot}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Add a {label} machine?</Text>
            <Text style={styles.modalText}>
              It gets the next free number and stays on every {label} sheet from now on.
            </Text>
            {processType === 'OE' ? (
              <View style={styles.modalField}>
                <Text style={styles.modalLabel}>Rotor count</Text>
                <TextInput
                  style={styles.modalInput}
                  value={rotorText}
                  onChangeText={(t) => setRotorText(t.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="e.g. 448"
                  placeholderTextColor={GateColors.textMuted}
                  accessibilityLabel="Rotor count"
                />
              </View>
            ) : null}
            {addError ? <Text style={styles.modalError}>{addError}</Text> : null}
            <View style={styles.btnRow}>
              <GateButton label="Cancel" variant="ghost" onPress={() => setAddOpen(false)} disabled={addMachine.isPending} style={styles.flex1} />
              <GateButton label="Add machine" loading={addMachine.isPending} onPress={submitAdd} style={styles.flex1} />
            </View>
          </View>
        </View>
      </Modal>

      <SelectSheet
        visible={pickFor !== null}
        title={pickFor === 'ALL' ? 'Count for all rows' : 'Count'}
        options={counts.map((c) => ({ id: c.id, title: c.label }))}
        value={pickFor && pickFor !== 'ALL' ? get(pickFor).count_id || null : null}
        searchable={false}
        searchPlaceholder=""
        emptyText="No counts available"
        onClose={() => setPickFor(null)}
        onSelect={(id) => {
          if (!id || !pickFor) return;
          if (pickFor === 'ALL') {
            setValues((v) => {
              const next = { ...v };
              machines.filter((m) => isEditing(m.id) && (!savedRows[m.id] || correcting === m.id)).forEach((m) => {
                next[m.id] = { ...(next[m.id] ?? EMPTY_ROW), count_id: id };
              });
              return next;
            });
          } else {
            setCell(pickFor, 'count_id', id);
          }
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  flex1: { flex: 1 },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 },
  bulkBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  bulkText: { fontSize: 12, fontWeight: '600', color: GateColors.primary },
  lockedBanner: { backgroundColor: GateColors.warningLight, borderRadius: GateRadius.md, padding: 12 },
  lockedText: { fontSize: 13, lineHeight: 18, color: GateColors.warning },

  grid: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: 6,
    backgroundColor: GateColors.surface1,
    overflow: 'hidden',
  },
  scrollPart: { flex: 1 },
  row: { flexDirection: 'row' },
  headCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: GateColors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
    borderLeftWidth: 1,
    borderLeftColor: GateColors.surface3,
  },
  frozenHead: { borderLeftWidth: 0, borderRightWidth: 1, borderRightColor: GateColors.surface4 },
  headText: { fontSize: 11, fontWeight: '800', color: GateColors.textPrimary, textAlign: 'center' },
  frozenCell: {
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
    borderRightWidth: 1,
    borderRightColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  rowError: { borderLeftWidth: 3, borderLeftColor: GateColors.danger, backgroundColor: GateColors.dangerLight },
  machineNo: { fontSize: 16, fontWeight: '800', color: GateColors.textPrimary },
  machineCode: { fontSize: 10, color: GateColors.textSecondary },
  deleteText: { fontSize: 10, fontWeight: '700', color: GateColors.danger, marginTop: 1 },
  cell: {
    height: ROW_H,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
    borderLeftWidth: 1,
    borderLeftColor: GateColors.surface3,
    backgroundColor: GateColors.surface1,
  },
  cellSaved: { backgroundColor: GateColors.surface0 },
  cellText: { fontSize: 14, color: GateColors.textPrimary, textAlign: 'center', paddingHorizontal: 4 },
  cellTextLeft: { textAlign: 'left', paddingHorizontal: 8 },
  placeholder: { color: GateColors.textMuted },
  input: {
    height: '100%',
    width: '100%',
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: 15,
    fontWeight: '600',
    color: GateColors.textPrimary,
  },
  inputLeft: { textAlign: 'left', paddingHorizontal: 8, fontWeight: '400', fontSize: 14 },
  actionBox: { alignItems: 'center', gap: 2 },
  correctBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: GateRadius.sm,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  correctText: { fontSize: 12, fontWeight: '600', color: GateColors.primary },
  badge: { fontSize: 10, fontWeight: '700', color: GateColors.warning },
  editingText: { fontSize: 12, fontWeight: '700', color: GateColors.warning, textAlign: 'center' },

  rowErrorText: { fontSize: 12, color: GateColors.danger, fontWeight: '600' },
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
  totalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: GateColors.surface4 },
  totalSub: { fontSize: 11, color: GateColors.textMuted, marginTop: 2 },
  totalValue: { fontSize: 20, fontWeight: '800', color: GateColors.onPrimary },
  errorBox: {
    backgroundColor: GateColors.dangerLight,
    borderWidth: 1,
    borderColor: GateColors.danger,
    borderRadius: GateRadius.md,
    padding: 12,
  },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  correctionBar: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1.5,
    borderColor: GateColors.warning,
    borderRadius: GateRadius.md,
    padding: 12,
    gap: 10,
  },
  correctionTitle: { fontSize: 14, fontWeight: '700', color: GateColors.textPrimary },
  noteInput: {
    minHeight: 46,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    fontSize: 14,
    color: GateColors.textPrimary,
    backgroundColor: GateColors.surface1,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  history: { gap: 4 },
  historyTitle: { fontSize: 12, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase' },
  historyLine: { fontSize: 12, color: GateColors.textSecondary },
  empty: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderStyle: 'dashed',
    borderRadius: GateRadius.lg,
    padding: 28,
    alignItems: 'center',
    gap: 6,
  },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  emptySub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  addRowBtn: {
    minHeight: 46,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GateRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: GateColors.primary,
    backgroundColor: GateColors.surface1,
  },
  addRowText: { fontSize: 14, fontWeight: '700', color: GateColors.primary },
  modalRoot: { flex: 1, backgroundColor: GateColors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: GateColors.surface1, borderRadius: GateRadius.lg, padding: 20, gap: 12 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  modalText: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary },
  modalField: { gap: 6 },
  modalLabel: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
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
});
