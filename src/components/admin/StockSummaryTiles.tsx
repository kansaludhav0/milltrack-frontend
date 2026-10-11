import { useQuery } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DateStepper } from '@/components/DateStepper';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getStockSummaryApi } from '@/lib/api';
import { addDays, formatShiftDate, toISODate } from '@/lib/dates';
import type { StockSummaryOut } from '@/lib/types';

const num = (v: string | undefined) => parseFloat(v ?? '') || 0;
const kg = (v: number) => v.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${kg(Math.abs(v))}`;

type Metric = { label: string; get: (s: StockSummaryOut) => number; sub?: boolean };
const LEVELS: Metric[] = [
  { label: 'In godown (inventory)', get: (s) => num(s.total_inventory_kg) },
  { label: 'In mixing (WIP)', get: (s) => num(s.total_wip_kg) },
  { label: 'Raw material', get: (s) => num(s.total_wip_raw_material_kg), sub: true },
  { label: 'Own waste', get: (s) => num(s.total_wip_own_waste_kg), sub: true },
  { label: 'Packed, not dispatched', get: (s) => num(s.packaging_inventory_kg) },
];
const FLOWS: Metric[] = [
  { label: 'Raw material received', get: (s) => num(s.raw_material_received_kg) },
  { label: 'Production (DOFF output)', get: (s) => num(s.total_production_kg) },
  { label: 'Dispatched', get: (s) => num(s.dispatched_kg) },
];

/** Everything accounted for at a snapshot: godown + mixing + packed + dispatched. */
const accountedFor = (s: StockSummaryOut) =>
  num(s.total_inventory_kg) + num(s.total_wip_kg) + num(s.packaging_inventory_kg) + num(s.dispatched_kg);

type Period = { mode: 'all' } | { mode: 'range'; start: string; end: string };

/**
 * The whole-mill conservation view. Material only moves between stages, so what
 * was received should reappear in godown, mixing, packaging or dispatch (minus
 * waste). Levels come "as of" a day; flows cover a period. Compare two days to
 * watch material move from one stage to the next.
 */
export function StockSummaryTiles() {
  const today = toISODate(new Date());
  const [asOf, setAsOf] = useState<string | null>(null); // null = right now
  const [compare, setCompare] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>({ mode: 'all' });

  const range = period.mode === 'range' ? { startDate: period.start, endDate: period.end } : {};
  const a = useQuery({
    queryKey: ['admin-stock-summary', asOf, period],
    queryFn: () => getStockSummaryApi({ asOfDate: asOf ?? undefined, ...range }),
    refetchInterval: asOf === null ? 60_000 : false,
  });
  const b = useQuery({
    queryKey: ['admin-stock-summary', compare, period],
    queryFn: () => getStockSummaryApi({ asOfDate: compare ?? undefined, ...range }),
    enabled: compare !== null,
  });

  const labelA = asOf ? formatShiftDate(asOf) : 'Now';
  const labelB = compare ? formatShiftDate(compare) : '';
  const hasB = compare !== null && !!b.data;
  const loading = a.isLoading || (compare !== null && b.isLoading);
  const failed = a.isError || (compare !== null && b.isError);
  const err = (a.error ?? b.error) as Error | null;

  const row = (m: Metric, key: string) => {
    const va = a.data ? m.get(a.data) : 0;
    const vb = hasB && b.data ? m.get(b.data) : null;
    return (
      <View key={key} style={[styles.tr, m.sub && styles.trSub]}>
        <Text style={[styles.tdLabel, m.sub && styles.subLabel]} numberOfLines={2}>{m.sub ? `  ${m.label}` : m.label}</Text>
        <Text style={[styles.tdNum, !m.sub && styles.strong]}>{kg(va)}</Text>
        {vb !== null ? <Text style={[styles.tdNum, !m.sub && styles.strong]}>{kg(vb)}</Text> : null}
        {vb !== null ? <Text style={[styles.tdNum, styles.change]}>{signed(va - vb)}</Text> : null}
      </View>
    );
  };

  const head = (
    <View style={[styles.tr, styles.thRow]}>
      <Text style={[styles.tdLabel, styles.th]}>kg</Text>
      <Text style={[styles.tdNum, styles.th]} numberOfLines={1}>{labelA}</Text>
      {hasB ? <Text style={[styles.tdNum, styles.th]} numberOfLines={1}>{labelB}</Text> : null}
      {hasB ? <Text style={[styles.tdNum, styles.th]}>Change</Text> : null}
    </View>
  );

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.heading}>Overview</Text>
        <Text style={styles.sub}>Where the mill&apos;s material is, and whether everything is accounted for.</Text>
      </View>

      {/* Controls */}
      <View style={styles.card}>
        <Text style={styles.ctrlTitle}>Stock levels as of</Text>
        <View style={styles.chips}>
          <Chip label="Now" active={asOf === null} onPress={() => setAsOf(null)} />
          <Chip label="A past day" active={asOf !== null} onPress={() => setAsOf(asOf ?? addDays(today, -1))} />
        </View>
        {asOf !== null ? <DateStepper date={asOf} onChange={setAsOf} allowFuture={false} /> : null}

        <Text style={styles.ctrlTitle}>Compare with</Text>
        <View style={styles.chips}>
          <Chip label="Nothing" active={compare === null} onPress={() => setCompare(null)} />
          <Chip label="Another day" active={compare !== null} onPress={() => setCompare(compare ?? addDays(asOf ?? today, -7))} />
        </View>
        {compare !== null ? <DateStepper date={compare} onChange={setCompare} allowFuture={false} /> : null}

        <Text style={styles.ctrlTitle}>Flow period (received, production, dispatched)</Text>
        <View style={styles.chips}>
          <Chip label="All time" active={period.mode === 'all'} onPress={() => setPeriod({ mode: 'all' })} />
          <Chip
            label="Date range"
            active={period.mode === 'range'}
            onPress={() => period.mode === 'range' || setPeriod({ mode: 'range', start: addDays(today, -30), end: today })}
          />
        </View>
        {period.mode === 'range' ? (
          <View style={styles.rangeBox}>
            <View style={styles.rangeCol}>
              <Text style={styles.rangeLabel}>From</Text>
              <DateStepper date={period.start} onChange={(d) => setPeriod({ ...period, start: d, end: d > period.end ? d : period.end })} allowFuture={false} />
            </View>
            <View style={styles.rangeCol}>
              <Text style={styles.rangeLabel}>To</Text>
              <DateStepper date={period.end} onChange={(d) => setPeriod({ ...period, end: d, start: d < period.start ? d : period.start })} allowFuture={false} />
            </View>
          </View>
        ) : null}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 28 }} />
      ) : failed || !a.data ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Could not load the overview</Text>
          <Text style={styles.errorSub}>{err?.message ?? 'Something went wrong.'}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => { a.refetch(); if (compare) b.refetch(); }}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Where the material is {asOf ? `(${labelA})` : '(now)'}</Text>
            {head}
            {LEVELS.map((m) => row(m, m.label))}
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              Flow {period.mode === 'all' ? '(all time)' : `(${formatShiftDate(period.start)} to ${formatShiftDate(period.end)})`}
            </Text>
            {head}
            {FLOWS.map((m) => row(m, m.label))}
          </View>

          {/* The conservation check */}
          <View style={[styles.card, styles.balance]}>
            <Text style={styles.cardTitle}>Is everything accounted for?</Text>
            {head}
            {(() => {
              const calc = (s: StockSummaryOut) => {
                const received = num(s.raw_material_received_kg);
                const acc = accountedFor(s);
                return { received, acc, gap: received - acc, pct: received > 0 ? ((received - acc) / received) * 100 : 0 };
              };
              const ca = calc(a.data!);
              const cb = hasB && b.data ? calc(b.data) : null;
              const line = (label: string, va: number, vb: number | null, strong?: boolean) => (
                <View style={styles.tr}>
                  <Text style={[styles.tdLabel, strong && styles.strong]} numberOfLines={2}>{label}</Text>
                  <Text style={[styles.tdNum, strong && styles.strong]}>{kg(va)}</Text>
                  {vb !== null ? <Text style={[styles.tdNum, strong && styles.strong]}>{kg(vb)}</Text> : null}
                  {vb !== null ? <Text style={[styles.tdNum, styles.change]}>{signed(va - vb)}</Text> : null}
                </View>
              );
              return (
                <>
                  {line('Received', ca.received, cb ? cb.received : null)}
                  {line('Accounted for', ca.acc, cb ? cb.acc : null)}
                  {line('Not accounted for (waste / loss)', ca.gap, cb ? cb.gap : null, true)}
                  <View style={styles.pctRow}>
                    <Text style={styles.pctText}>
                      {kg(ca.pct)}% of received{cb ? `  ·  ${kg(cb.pct)}% on ${labelB}` : ''}
                    </Text>
                  </View>
                </>
              );
            })()}
            <Text style={styles.note}>
              Material only moves between stages. Received should roughly equal what is accounted for: in the godown,
              in mixing, packed and dispatched. A small gap is waste and is expected. Watch for it growing.
              {period.mode === 'range' ? ' A date range only covers part of the flow, so for this check use All time.' : ''}
            </Text>
          </View>

          <Text style={styles.limit}>
            Levels are close reconstructions from the ledger, not an exact replay. Mixing and spinning run continuously, so
            a particular unit of raw material does not map to a particular unit of output.
          </Text>
        </>
      )}
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  heading: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  sub: { fontSize: 13, color: GateColors.textSecondary, marginTop: 2 },
  card: { backgroundColor: GateColors.surface1, borderRadius: GateRadius.lg, borderWidth: 1, borderColor: GateColors.surface3, padding: 14, gap: 10 },
  balance: { borderColor: GateColors.primary },
  cardTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
  ctrlTitle: { fontSize: 12, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: GateRadius.full, borderWidth: 1.5, borderColor: GateColors.surface4, backgroundColor: GateColors.surface2 },
  chipActive: { borderColor: GateColors.primary, backgroundColor: GateColors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  chipTextActive: { color: GateColors.primary, fontWeight: '700' },
  rangeBox: { gap: 10 },
  rangeCol: { gap: 4 },
  rangeLabel: { fontSize: 12, fontWeight: '600', color: GateColors.textSecondary },
  tr: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, borderTopWidth: 1, borderTopColor: GateColors.surface3 },
  trSub: { paddingVertical: 5 },
  thRow: { borderTopWidth: 0, paddingVertical: 4 },
  th: { fontSize: 11, fontWeight: '700', color: GateColors.textSecondary },
  tdLabel: { flex: 2.2, minWidth: 0, fontSize: 13, color: GateColors.textPrimary },
  subLabel: { color: GateColors.textSecondary, fontSize: 12 },
  tdNum: { flex: 1.3, textAlign: 'right', fontSize: 13, color: GateColors.textPrimary },
  strong: { fontWeight: '800' },
  change: { fontWeight: '700', color: GateColors.textSecondary },
  pctRow: { paddingTop: 4 },
  pctText: { fontSize: 13, fontWeight: '700', color: GateColors.primary },
  note: { fontSize: 12, lineHeight: 17, color: GateColors.textSecondary, marginTop: 4 },
  limit: { fontSize: 11, lineHeight: 16, color: GateColors.textMuted },
  errorCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 28, alignItems: 'center', gap: 6 },
  errorTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  errorSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center' },
  retry: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
