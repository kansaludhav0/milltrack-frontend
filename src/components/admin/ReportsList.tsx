import { useQuery } from '@tanstack/react-query';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { DateStepper } from '@/components/DateStepper';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getReportsApi } from '@/lib/api';
import { addDays, formatShiftDate, toISODate } from '@/lib/dates';
import { formatDateTime } from '@/lib/format';
import { SHIFT_LABEL } from '@/lib/supervisor';
import type { GeneratedReportOut, ReportType } from '@/lib/types';

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void;
}

const TYPES: { key: ReportType | null; label: string }[] = [
  { key: null, label: 'All' },
  { key: 'PRODUCTION', label: 'Production' },
  { key: 'MIXING', label: 'Mixing' },
  { key: 'PACKAGING', label: 'Packaging' },
];

const TYPE_LABEL: Record<ReportType, string> = {
  PRODUCTION: 'Production sheet',
  MIXING: 'Mixing sheet',
  PACKAGING: 'Packaging sheet',
};

// The file links are signed and expire, so a list older than this is refetched before a link is opened.
const LINK_MAX_AGE_MS = 10 * 60_000;

const isStale = (updatedAt: number) => Date.now() - updatedAt > LINK_MAX_AGE_MS;

/**
 * Every generated PDF sheet, newest first. Read-only on purpose: these are permanent
 * records, so there is no edit or delete anywhere. Tapping a row opens the PDF.
 */
export function ReportsList({ onToast }: Props) {
  const [type, setType] = useState<ReportType | null>(null);
  const [period, setPeriod] = useState<{ start: string; end: string } | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['admin-reports', type, period?.start ?? null, period?.end ?? null],
    queryFn: () => getReportsApi({ reportType: type ?? undefined, startDate: period?.start, endDate: period?.end }),
    staleTime: 0,
    gcTime: 0, // never keep signed links around
    refetchOnMount: 'always',
  });
  const rows = query.data ?? [];

  const open = async (r: GeneratedReportOut) => {
    setOpening(r.id);
    try {
      let url = r.file_url;
      if (isStale(query.dataUpdatedAt)) {
        const fresh = await query.refetch();
        url = fresh.data?.find((x) => x.id === r.id)?.file_url ?? url;
      }
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      onToast((e as Error).message || 'Could not open the PDF.', 'error');
    } finally {
      setOpening(null);
    }
  };

  const today = toISODate(new Date());

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.heading}>Reports</Text>
        <Text style={styles.sub}>Permanent PDF sheets, frozen when each shift, mixing lot or packaging day was finished.</Text>
      </View>

      <View style={styles.filters}>
        <View style={styles.chips}>
          {TYPES.map((t) => (
            <Chip key={t.label} label={t.label} active={type === t.key} onPress={() => setType(t.key)} />
          ))}
        </View>
        <View style={styles.chips}>
          <Chip label="All dates" active={period === null} onPress={() => setPeriod(null)} />
          <Chip label="Date range" active={period !== null} onPress={() => setPeriod(period ?? { start: addDays(today, -7), end: today })} />
        </View>
        {period ? (
          <View style={styles.range}>
            <View style={styles.rangeItem}>
              <Text style={styles.rangeLabel}>From</Text>
              <DateStepper date={period.start} onChange={(d) => setPeriod({ start: d, end: d > period.end ? d : period.end })} allowFuture={false} />
            </View>
            <View style={styles.rangeItem}>
              <Text style={styles.rangeLabel}>To</Text>
              <DateStepper date={period.end} onChange={(d) => setPeriod({ end: d, start: d < period.start ? d : period.start })} allowFuture={false} />
            </View>
          </View>
        ) : null}
      </View>

      {query.isLoading ? (
        <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 24 }} />
      ) : query.isError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>Could not load the reports</Text>
          <Text style={styles.stateSub}>{(query.error as Error)?.message ?? 'Something went wrong.'}</Text>
          <TouchableOpacity style={styles.retry} onPress={() => query.refetch()}>
            <Text style={styles.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>No reports found</Text>
          <Text style={styles.stateSub}>
            {type || period ? 'Nothing matches these filters. Try another type or dates.' : 'Sheets appear here once a shift is locked, a mixing lot is completed or a packaging day is finalized.'}
          </Text>
        </View>
      ) : (
        <View style={styles.list}>
          {rows.map((r, i) => (
            <TouchableOpacity
              key={r.id}
              style={[styles.row, i > 0 && styles.rowBorder]}
              onPress={() => open(r)}
              disabled={opening !== null}
              accessibilityRole="link"
              accessibilityLabel={`Open ${TYPE_LABEL[r.report_type]} for ${formatShiftDate(r.report_date)}`}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowDate}>{formatShiftDate(r.report_date)}</Text>
                <Text style={styles.rowType} numberOfLines={1}>
                  {TYPE_LABEL[r.report_type]}
                  {r.shift_code ? ` · ${SHIFT_LABEL[r.shift_code]}` : ''}
                </Text>
                <Text style={styles.rowMeta}>Generated {formatDateTime(r.generated_at)}</Text>
              </View>
              {opening === r.id ? <ActivityIndicator size="small" color={GateColors.primary} /> : <Text style={styles.open}>Open PDF</Text>}
            </TouchableOpacity>
          ))}
        </View>
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
  sub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, marginTop: 2 },
  filters: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 14, gap: 12 },
  chips: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: GateRadius.full, borderWidth: 1.5, borderColor: GateColors.surface4, backgroundColor: GateColors.surface2 },
  chipActive: { borderColor: GateColors.primary, backgroundColor: GateColors.primaryLight },
  chipText: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  chipTextActive: { color: GateColors.primary, fontWeight: '700' },
  range: { gap: 10 },
  rangeItem: { gap: 4 },
  rangeLabel: { fontSize: 12, fontWeight: '600', color: GateColors.textSecondary },
  list: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  rowBorder: { borderTopWidth: 1, borderTopColor: GateColors.surface3 },
  rowMain: { flex: 1, minWidth: 0, gap: 2 },
  rowDate: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary },
  rowType: { fontSize: 13, fontWeight: '600', color: GateColors.primary },
  rowMeta: { fontSize: 12, color: GateColors.textSecondary },
  open: { fontSize: 13, fontWeight: '700', color: GateColors.primary },
  stateCard: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 26, alignItems: 'center', gap: 6 },
  stateTitle: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary, textAlign: 'center' },
  stateSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 320 },
  retry: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
