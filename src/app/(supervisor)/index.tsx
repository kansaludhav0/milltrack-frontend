/**
 * Supervisor production sheet — the digital "Production Sheet Day" register.
 * The shift comes from the server (it owns the 7 am / 7 pm boundary and the time
 * zone); fill one sheet per process (O/E, Card, Draw Frame), then lock the shift. DOFFs (loose stock from O/E) are logged on their own tab.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { Toast } from '@/components/gate/Toast';
import { DoffPanel } from '@/components/supervisor/DoffPanel';
import { ShiftSheet } from '@/components/supervisor/ShiftSheet';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getCurrentShiftApi, getLookupsApi, getShiftSubmissionApi, getSupervisorMachinesApi, submitShiftApi } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import {
  addDays,
  formatShiftDate,
  PROCESS_LABEL,
  PROCESS_TYPES,
  SHIFT_LABEL,
} from '@/lib/supervisor';
import type { ProcessType, ShiftCode } from '@/lib/types';

type Shift = { date: string; code: ShiftCode };
type Tab = ProcessType | 'DOFF';
const TABS: { key: Tab; label: string }[] = [
  ...PROCESS_TYPES.map((p) => ({ key: p as Tab, label: PROCESS_LABEL[p] })),
  { key: 'DOFF', label: 'DOFF' },
];

export default function SupervisorScreen() {
  const { fullName, signOut } = useAuth();

  const [tab, setTab] = useState<Tab>('OE');
  const qc = useQueryClient();

  // The server decides the current shift. The phone's clock and time zone are never used.
  const [accepted, setAccepted] = useState<Shift | null>(null); // the shift this session works in
  const [override, setOverride] = useState<Shift | null>(null); // only when the supervisor chooses another one
  const [changing, setChanging] = useState(false);
  const currentQuery = useQuery({
    queryKey: ['supervisor-current-shift'],
    queryFn: async () => {
      const c = await getCurrentShiftApi();
      const s: Shift = { date: c.shift_date, code: c.shift_code };
      setAccepted((prev) => prev ?? s);
      return s;
    },
    refetchInterval: 60_000, // notice the 7 am / 7 pm boundary quickly
  });
  const server = currentQuery.data ?? null;
  const shift = override ?? accepted;
  // The boundary passed while the app was open: offer the switch instead of dropping unsaved entries.
  const shiftChanged = !!(accepted && server && (server.date !== accepted.date || server.code !== accepted.code));
  const goCurrent = () => {
    if (server) setAccepted(server);
    setOverride(null);
    setChanging(false);
  };
  const [lockOpen, setLockOpen] = useState(false);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  const showToast = (message: string, type: 'success' | 'error' = 'success') =>
    setToast({ visible: true, message, type });

  const machinesQuery = useQuery({ queryKey: ['supervisor-machines'], queryFn: () => getSupervisorMachinesApi(true) });
  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });
  // Lock status comes from the server, so it is right on any device.
  const submissionKey = ['shift-submission', shift?.date, shift?.code] as const;
  const submissionQuery = useQuery({
    queryKey: submissionKey,
    queryFn: () => getShiftSubmissionApi(shift!.date, shift!.code),
    enabled: !!shift,
  });
  const locked = !!submissionQuery.data;

  const machines = useMemo(() => (Array.isArray(machinesQuery.data) ? machinesQuery.data : []), [machinesQuery.data]);
  const lock = useMutation({
    mutationFn: () => submitShiftApi(shift!.date, shift!.code),
    onSuccess: (submission) => {
      qc.setQueryData(submissionKey, submission);
      setLockOpen(false);
      showToast(`${SHIFT_LABEL[shift!.code]} on ${formatShiftDate(shift!.date)} is locked`);
    },
    onError: (e: Error & { status?: number }) => {
      setLockOpen(false);
      if (e.status === 409) {
        qc.invalidateQueries({ queryKey: submissionKey });
        showToast('This shift was already submitted, so it is locked.', 'error');
      } else {
        showToast(e.message || 'Could not lock the shift.', 'error');
      }
    },
  });

  // Choosing another shift is an override (e.g. catching up on an old shift), never the default
  const choose = (next: Shift) => setOverride(next);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title}>Production sheet</Text>
            <Text style={styles.user} numberOfLines={1}>{fullName ?? 'Supervisor'}</Text>
          </View>
          <TouchableOpacity
            style={styles.signOut}
            onPress={async () => {
              await signOut();
              router.replace('/login');
            }}
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>

        {/* The shift in use (from the server). Changing it is the exception. */}
        {shift ? (
          <View style={styles.shiftBar}>
            <View style={styles.shiftTop}>
              <View style={styles.shiftInfo}>
                <Text style={styles.shiftTitle}>{SHIFT_LABEL[shift.code]}</Text>
                <Text style={styles.shiftSub}>
                  {formatShiftDate(shift.date)} · {override ? 'Custom shift' : 'Current shift'}
                </Text>
              </View>
              <TouchableOpacity style={styles.changeBtn} onPress={() => setChanging((c) => !c)} testID="change-shift-btn">
                <Text style={styles.changeText}>{changing ? 'Done' : 'Change'}</Text>
              </TouchableOpacity>
            </View>

            {shiftChanged && server ? (
              <View style={styles.banner}>
                <Text style={styles.bannerText}>
                  The shift is now {SHIFT_LABEL[server.code]} ({formatShiftDate(server.date)}).
                </Text>
                <TouchableOpacity onPress={goCurrent}>
                  <Text style={styles.bannerLink}>Switch</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {changing ? (
              <View style={styles.changePanel}>
                <View style={styles.dateRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => choose({ ...shift, date: addDays(shift.date, -1) })} accessibilityLabel="Previous day">
                    <Text style={styles.stepText}>‹</Text>
                  </TouchableOpacity>
                  <View style={styles.dateBox}>
                    <Text style={styles.dateText}>{formatShiftDate(shift.date)}</Text>
                  </View>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => choose({ ...shift, date: addDays(shift.date, 1) })} accessibilityLabel="Next day">
                    <Text style={styles.stepText}>›</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.shiftRow}>
                  {(['SHIFT_A', 'SHIFT_B'] as ShiftCode[]).map((c) => (
                    <TouchableOpacity key={c} style={[styles.shiftChip, shift.code === c && styles.shiftChipActive]} onPress={() => choose({ ...shift, code: c })}>
                      <Text style={[styles.shiftText, shift.code === c && styles.shiftTextActive]}>{SHIFT_LABEL[c]}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TouchableOpacity onPress={goCurrent} disabled={!server}>
                  <Text style={styles.bannerLink}>Use the current shift</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Process tabs */}
        <View style={styles.tabsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {TABS.map((t) => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, tab === t.key && styles.tabActive]}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === t.key }}
              >
                <Text style={[styles.tabText, tab === t.key && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.inner}>
            {currentQuery.isError && !shift ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Could not get the current shift</Text>
                <Text style={styles.stateSub}>{(currentQuery.error as Error)?.message ?? 'Something went wrong.'}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => currentQuery.refetch()}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : !shift || machinesQuery.isLoading || (tab !== 'DOFF' && submissionQuery.isLoading) ? (
              <ActivityIndicator size="large" color={GateColors.primary} style={{ marginTop: 40 }} />
            ) : machinesQuery.isError ? (
              <View style={styles.stateCard}>
                <Text style={styles.stateTitle}>Could not load your machines</Text>
                <Text style={styles.stateSub}>{(machinesQuery.error as Error)?.message ?? 'Something went wrong.'}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => machinesQuery.refetch()}>
                  <Text style={styles.retryText}>Try again</Text>
                </TouchableOpacity>
              </View>
            ) : tab === 'DOFF' ? (
              <DoffPanel machines={machines.filter((m) => m.process_type === 'OE' && m.is_active)} lookups={lookups} shiftDate={shift.date} shiftCode={shift.code} onToast={showToast} />
            ) : (
              <>
                <ShiftSheet
                  key={`${tab}|${shift.date}|${shift.code}`}
                  processType={tab}
                  machines={machines.filter((m) => m.process_type === tab)}
                  shiftDate={shift.date}
                  shiftCode={shift.code}
                  locked={locked}
                  counts={lookups?.yarn_counts ?? []}
                  onToast={showToast}
                />

                {/* Lock the shift once the sheets are saved */}
                <View style={styles.lockCard}>
                  <View style={styles.lockText}>
                    <Text style={styles.lockTitle}>{locked ? 'Shift locked' : 'Finished with this shift?'}</Text>
                    <Text style={styles.lockSub}>
                      {locked
                        ? 'Only corrections to saved rows are accepted now.'
                        : 'Lock it when every sheet is saved. After that, readings can only be corrected.'}
                    </Text>
                  </View>
                  {!locked ? (
                    <TouchableOpacity style={styles.lockBtn} onPress={() => setLockOpen(true)} disabled={lock.isPending} testID="lock-shift-btn">
                      <Text style={styles.lockBtnText}>Lock shift</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={lockOpen}
        title="Lock this shift?"
        message={`${shift ? SHIFT_LABEL[shift.code] : ''} on ${shift ? formatShiftDate(shift.date) : ''}. After locking, new rows can't be added. A reading can only be changed with a correction.`}
        confirmLabel="Lock shift"
        loading={lock.isPending}
        onConfirm={() => lock.mutate()}
        onCancel={() => setLockOpen(false)}
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
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: GateColors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  user: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  signOut: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: GateRadius.md, borderWidth: 1, borderColor: GateColors.surface4 },
  signOutText: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  shiftBar: {
    backgroundColor: GateColors.surface1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  shiftTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shiftInfo: { flex: 1, minWidth: 0 },
  shiftTitle: { fontSize: 17, fontWeight: '800', color: GateColors.textPrimary },
  shiftSub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  changeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: GateRadius.md, borderWidth: 1, borderColor: GateColors.surface4 },
  changeText: { fontSize: 13, fontWeight: '600', color: GateColors.primary },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GateColors.warningLight, borderRadius: GateRadius.md, paddingHorizontal: 12, paddingVertical: 10 },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 18, color: GateColors.warning },
  bannerLink: { fontSize: 13, fontWeight: '700', color: GateColors.primary },
  changePanel: { gap: 10 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface1,
  },
  stepText: { fontSize: 22, lineHeight: 24, color: GateColors.textPrimary },
  dateBox: { flex: 1, alignItems: 'center' },
  dateText: { fontSize: 17, fontWeight: '800', color: GateColors.textPrimary },
  todayTag: { fontSize: 11, fontWeight: '700', color: GateColors.success },
  todayLink: { fontSize: 11, fontWeight: '700', color: GateColors.primary },
  shiftRow: { flexDirection: 'row', gap: 8 },
  shiftChip: {
    flex: 1,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GateRadius.md,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    backgroundColor: GateColors.surface2,
  },
  shiftChipActive: { borderColor: GateColors.primary, backgroundColor: GateColors.primaryLight },
  shiftText: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary },
  shiftTextActive: { color: GateColors.primary, fontWeight: '700' },
  tabsWrap: { backgroundColor: GateColors.surface1, borderBottomWidth: 1, borderBottomColor: GateColors.surface3 },
  tabsRow: { paddingHorizontal: 8 },
  tab: { paddingHorizontal: 18, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: GateColors.primary },
  tabText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  tabTextActive: { color: GateColors.primary, fontWeight: '700' },
  content: { padding: 12, paddingBottom: 96 },
  inner: { width: '100%', maxWidth: 1100, alignSelf: 'center', gap: 14 },
  lockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    padding: 14,
  },
  lockText: { flex: 1, minWidth: 0, gap: 2 },
  lockTitle: { fontSize: 14, fontWeight: '700', color: GateColors.textPrimary },
  lockSub: { fontSize: 12, lineHeight: 17, color: GateColors.textSecondary },
  lockBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: GateRadius.md, borderWidth: 1.5, borderColor: GateColors.primary },
  lockBtnText: { fontSize: 13, fontWeight: '700', color: GateColors.primary },
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
  stateSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center', maxWidth: 300 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: GateRadius.md, backgroundColor: GateColors.primary },
  retryText: { color: GateColors.onPrimary, fontWeight: '700', fontSize: 14 },
});
