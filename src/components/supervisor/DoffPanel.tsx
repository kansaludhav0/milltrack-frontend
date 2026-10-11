import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import uuid from 'react-native-uuid';

import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { coneTypeShort } from '@/lib/cone';
import { createDoffApi, getDoffTotalApi, getLastDoffApi } from '@/lib/api';
import { DOFF_EXPECTED_HOURS, DOFF_WARN_ABOVE_HOURS, DOFF_WARN_BELOW_HOURS } from '@/lib/supervisor';
import { SHIFT_LABEL } from '@/lib/supervisor';
import type { DoffOut, LookupsResponse, ShiftCode, SupervisorMachine } from '@/lib/types';

const kg = (v: string | number) =>
  (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const h = d.getHours();
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]}, ${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
};

interface Props {
  machines: SupervisorMachine[];
  lookups: LookupsResponse | undefined;
  /** The shift in use (from the server), for the per-shift DOFF total. */
  shiftDate: string;
  shiftCode: ShiftCode;
  onToast: (message: string, type: 'success' | 'error') => void;
}

/**
 * Log a DOFF (the spun package removed from an O/E machine, about every 20 h).
 * The server turns it into loose stock and links it to the running lot.
 */
export function DoffPanel({ machines, lookups, shiftDate, shiftCode, onToast }: Props) {
  const qc = useQueryClient();
  const [machineId, setMachineId] = useState<string | null>(null);
  const [countId, setCountId] = useState<string | null>(null);
  const [coneId, setConeId] = useState<string | null>(null);
  const [colourId, setColourId] = useState<string | null>(null);
  const [rotorEdit, setRotorEdit] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DoffOut | null>(null);
  const [session, setSession] = useState<DoffOut[]>([]);
  // Stable id so a retried tap after a dropped connection cannot log the DOFF twice.
  const doffId = useRef<string | null>(null);

  const machine = machines.find((m) => m.id === machineId) ?? null;
  const rotorText = rotorEdit ?? (machine?.rotor_count ? String(machine.rotor_count) : '');

  const counts = lookups?.yarn_counts ?? [];
  const cones = lookups?.cone_types ?? [];
  const colours = lookups?.bobbin_colours ?? [];
  const coneLabel = (id: string) => {
    const c = cones.find((x) => x.id === id);
    return c ? coneTypeShort(c) : '';
  };

  const last = useQuery({
    queryKey: ['doff-last', machineId],
    queryFn: () => getLastDoffApi(machineId!),
    enabled: !!machineId,
    refetchInterval: 60_000, // keeps "hours since the last DOFF" live
    // hours_since_previous is the gap BEFORE the last DOFF, so the live elapsed time is computed here.
    select: (d) =>
      d ? { ...d, elapsedHours: (Date.now() - new Date(d.occurred_at).getTime()) / 3_600_000 } : null,
  });

  const total = useQuery({
    queryKey: ['doff-total', machineId, shiftDate, shiftCode],
    queryFn: () => getDoffTotalApi(machineId!, shiftDate, shiftCode),
    enabled: !!machineId,
  });

  const elapsed = last.data?.elapsedHours ?? null;
  const priorCycle = last.data?.hours_since_previous ? parseFloat(last.data.hours_since_previous) : null;
  const outOfCycle = elapsed !== null && (elapsed < DOFF_WARN_BELOW_HOURS || elapsed > DOFF_WARN_ABOVE_HOURS);

  const create = useMutation({
    mutationFn: () => {
      doffId.current ??= uuid.v4() as string;
      return createDoffApi({
        id: doffId.current,
        machine_id: machineId!,
        count_id: countId!,
        cone_type_id: coneId!,
        bobbin_colour_id: colourId!,
        rotor_count: parseInt(rotorText, 10),
      });
    },
    onSuccess: (doff) => {
      doffId.current = null;
      setResult(doff);
      setSession((s) => [doff, ...s]);
      setError(null);
      qc.invalidateQueries({ queryKey: ['doff-last', machineId] });
      qc.invalidateQueries({ queryKey: ['doff-total', machineId] });
      onToast(`${doff.doff_code} logged · ${kg(doff.loose_stock_kg)} kg loose stock`, 'success');
    },
    onError: (e: Error) => setError(e.message || 'Could not log the DOFF.'),
  });

  const submit = () => {
    setError(null);
    if (!machineId) return setError('Choose the machine.');
    if (!countId) return setError('Choose the count.');
    if (!coneId) return setError('Choose the cone type.');
    if (!colourId) return setError('Choose the bobbin colour.');
    if (!/^\d+$/.test(rotorText) || parseInt(rotorText, 10) <= 0) return setError('Enter the rotor count.');
    setResult(null);
    create.mutate();
  };

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.heading}>DOFF</Text>
        <Text style={styles.sub}>Log each package removed from an O/E machine. It becomes loose stock.</Text>
      </View>

      {machines.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No O/E machines assigned</Text>
        </View>
      ) : (
        <>
          <SelectField
            label="Machine"
            placeholder="Select O/E machine"
            sheetTitle="O/E machine"
            searchable={false}
            options={machines.map((m) => ({ id: m.id, title: `Machine ${m.display_no}`, subtitle: m.machine_code }))}
            value={machineId}
            onChange={(id) => {
              setMachineId(id);
              setRotorEdit(null);
              setResult(null);
              setError(null);
              doffId.current = null;
            }}
          />

          {machineId ? (
            <View style={[styles.lastCard, outOfCycle && styles.lastCardWarn]}>
              {last.isLoading ? (
                <ActivityIndicator size="small" color={GateColors.primary} />
              ) : last.isError ? (
                <Text style={styles.lastText}>Could not load the previous DOFF.</Text>
              ) : last.data ? (
                <>
                  <Text style={styles.lastLabel}>Last DOFF</Text>
                  <Text style={styles.lastValue}>
                    {fmtDateTime(last.data.occurred_at)}
                    {elapsed !== null ? `  ·  ${elapsed.toLocaleString('en-IN', { maximumFractionDigits: 1 })} h ago` : ''}
                  </Text>
                  {outOfCycle ? (
                    <Text style={styles.lastWarn}>
                      {elapsed! < DOFF_WARN_BELOW_HOURS
                        ? `Only ${elapsed!.toLocaleString('en-IN', { maximumFractionDigits: 1 })} h since the last DOFF, well under the usual ~${DOFF_EXPECTED_HOURS} h. This may be a duplicate.`
                        : `${elapsed!.toLocaleString('en-IN', { maximumFractionDigits: 1 })} h since the last DOFF, well over the usual ~${DOFF_EXPECTED_HOURS} h. A DOFF may have been missed.`}
                    </Text>
                  ) : (
                    <Text style={styles.lastText}>Within the usual ~{DOFF_EXPECTED_HOURS} h cycle.</Text>
                  )}
                  {priorCycle !== null ? (
                    <Text style={styles.lastText}>
                      The cycle before that was {priorCycle.toLocaleString('en-IN', { maximumFractionDigits: 1 })} h.
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={styles.lastText}>No earlier DOFF is recorded for this machine.</Text>
              )}
            </View>
          ) : null}

          {machineId && total.data ? (
            <View style={styles.totalCard}>
              <Text style={styles.lastLabel}>{SHIFT_LABEL[shiftCode]} total</Text>
              <Text style={styles.totalValue}>
                {total.data.doff_count} {total.data.doff_count === 1 ? 'DOFF' : 'DOFFs'} · {kg(total.data.total_loose_stock_kg)} kg
              </Text>
              <Text style={styles.lastText}>Loose stock from this machine during this shift.</Text>
            </View>
          ) : null}

          <SelectField
            label="Count"
            placeholder="Select count"
            sheetTitle="Count"
            searchable={false}
            options={counts.map((c) => ({ id: c.id, title: c.label }))}
            value={countId}
            onChange={setCountId}
          />
          <SelectField
            label="Cone type"
            placeholder="Select cone type"
            sheetTitle="Cone type"
            searchable={false}
            options={cones.map((c) => ({ id: c.id, title: coneLabel(c.id) }))}
            value={coneId}
            onChange={setConeId}
          />
          <SelectField
            label="Bobbin colour"
            placeholder="Select colour"
            sheetTitle="Bobbin colour"
            searchable={false}
            options={colours.map((c) => ({ id: c.id, title: c.name }))}
            value={colourId}
            onChange={setColourId}
          />

          <View style={styles.group}>
            <Text style={styles.label}>Rotor count</Text>
            <TextInput
              style={styles.input}
              value={rotorText}
              onChangeText={(t) => setRotorEdit(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="e.g. 448"
              placeholderTextColor={GateColors.textMuted}
              accessibilityLabel="Rotor count"
            />
          </View>

          {error ? (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          <GateButton label="Log DOFF" size="lg" loading={create.isPending} onPress={submit} testID="log-doff-btn" />
        </>
      )}

      {result ? (
        <View style={styles.resultCard}>
          <Text style={styles.resultCode}>{result.doff_code}</Text>
          <Text style={styles.resultKg}>{kg(result.loose_stock_kg)} kg</Text>
          <Text style={styles.resultSub}>loose stock from this DOFF</Text>
        </View>
      ) : null}

      {session.length > 1 ? (
        <View style={styles.listCard}>
          <Text style={styles.listTitle}>Logged this session</Text>
          {session.map((d) => (
            <View key={d.id} style={styles.listRow}>
              <Text style={styles.listMain}>{d.doff_code}</Text>
              <Text style={styles.listKg}>{kg(d.loose_stock_kg)} kg</Text>
            </View>
          ))}
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  heading: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  sub: { fontSize: 13, color: GateColors.textSecondary, marginTop: 2 },
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  input: {
    minHeight: 50,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    color: GateColors.textPrimary,
    backgroundColor: GateColors.surface2,
  },
  lastCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    padding: 14,
    gap: 3,
  },
  lastCardWarn: { borderColor: GateColors.warning, backgroundColor: GateColors.warningLight },
  lastLabel: { fontSize: 12, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  lastValue: { fontSize: 18, fontWeight: '800', color: GateColors.textPrimary },
  lastText: { fontSize: 13, color: GateColors.textSecondary },
  lastWarn: { fontSize: 13, fontWeight: '700', color: GateColors.warning, lineHeight: 18 },
  totalCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 14, gap: 3 },
  totalValue: { fontSize: 17, fontWeight: '800', color: GateColors.textPrimary },
  errorBox: {
    backgroundColor: GateColors.dangerLight,
    borderWidth: 1,
    borderColor: GateColors.danger,
    borderRadius: GateRadius.md,
    padding: 12,
  },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  resultCard: {
    backgroundColor: GateColors.successLight,
    borderRadius: GateRadius.lg,
    padding: 18,
    alignItems: 'center',
    gap: 2,
  },
  resultCode: { fontSize: 15, fontWeight: '700', color: GateColors.success },
  resultKg: { fontSize: 32, fontWeight: '800', color: GateColors.textPrimary },
  resultSub: { fontSize: 13, color: GateColors.textSecondary },
  listCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    padding: 14,
    gap: 8,
  },
  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listTitle: { fontSize: 14, fontWeight: '700', color: GateColors.textPrimary },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
  listText: { flex: 1, minWidth: 0 },
  listMain: { fontSize: 14, fontWeight: '600', color: GateColors.textPrimary, flex: 1 },
  listSub: { fontSize: 12, color: GateColors.textSecondary },
  listKg: { fontSize: 14, fontWeight: '800', color: GateColors.primary },
  empty: { padding: 24, alignItems: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
});
