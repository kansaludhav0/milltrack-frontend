/**
 * Pack a bag. One bag per entry: choose what it is for, weigh it, save. The
 * server returns the bag's unique code. Selections are kept so the next bag of
 * the same kind only needs a new weight.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { PackagingHeader } from '@/components/packaging/PackagingHeader';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getLooseStockApi, getLookupsApi, getPackedTodayApi, packBagApi } from '@/lib/api';
import { bagKg, coneKg, coneTypeLabel, coneTypeShort } from '@/lib/cone';
import type { PackagingRecordOut } from '@/lib/types';

const kg = (v: string | number) =>
  (typeof v === 'number' ? v : parseFloat(v) || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function PackBagScreen() {
  const qc = useQueryClient();
  const [countId, setCountId] = useState<string | null>(null);
  const [palliId, setPalliId] = useState<string | null>(null);
  const [bobbinId, setBobbinId] = useState<string | null>(null);
  const [coneId, setConeId] = useState<string | null>(null);
  const [weight, setWeight] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PackagingRecordOut | null>(null);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'success' as 'success' | 'error' });
  // One stable id per bag so a retry after a dropped connection can never pack it twice.
  const bagId = useRef<string | null>(null);

  const { data: lookups } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 5 * 60_000 });
  const loose = useQuery({ queryKey: ['pkg-loose'], queryFn: getLooseStockApi });
  const today = useQuery({ queryKey: ['pkg-packed-today'], queryFn: getPackedTodayApi });

  const counts = lookups?.yarn_counts ?? [];
  const pallis = lookups?.pallis ?? [];
  const bobbins = lookups?.bobbin_colours ?? [];
  const cones = lookups?.cone_types ?? [];
  const cone = cones.find((c) => c.id === coneId) ?? null;
  const countLabel = (id: string) => counts.find((c) => c.id === id)?.label ?? '';
  const palliName = (id: string) => pallis.find((p) => p.id === id)?.display_name ?? '';
  const bobbinName = (id: string) => bobbins.find((b) => b.id === id)?.name ?? '';

  // Loose stock is a shared pool (count + cone type + bobbin colour), shown for the chosen combination.
  const pool =
    countId && coneId && bobbinId
      ? (Array.isArray(loose.data) ? loose.data : []).find(
          (r) => r.count_id === countId && r.cone_type_id === coneId && r.bobbin_colour_id === bobbinId
        )
      : undefined;

  const target = cone ? bagKg(cone) : null;
  const w = /^\d+(\.\d+)?$/.test(weight) ? parseFloat(weight) : null;
  const diff = w !== null && target !== null ? w - target : null;

  const pack = useMutation({
    mutationFn: () => {
      bagId.current ??= uuid.v4() as string;
      return packBagApi({
        id: bagId.current,
        count_id: countId!,
        palli_id: palliId!,
        bobbin_colour_id: bobbinId!,
        cone_type_id: coneId!,
        net_weight_kg: parseFloat(weight).toFixed(2),
      });
    },
    onSuccess: (bag) => {
      bagId.current = null;
      setResult(bag);
      setWeight('');
      setError(null);
      qc.invalidateQueries({ queryKey: ['pkg-packed-today'] });
      qc.invalidateQueries({ queryKey: ['pkg-loose'] });
      setToast({ visible: true, message: `${bag.bag_code} packed`, type: 'success' });
    },
    onError: (e: Error) => setError(e.message || 'Could not save the bag.'),
  });

  const submit = () => {
    setError(null);
    if (!countId) return setError('Choose the count.');
    if (!palliId) return setError('Choose the client + colour.');
    if (!bobbinId) return setError('Choose the bobbin colour.');
    if (!coneId) return setError('Choose the cone type.');
    if (w === null || w <= 0) return setError('Enter the weighed bag weight in kg.');
    setResult(null);
    pack.mutate();
  };

  const bags = Array.isArray(today.data) ? today.data : [];
  const totalKg = bags.reduce((s, b) => s + (parseFloat(b.net_weight_kg) || 0), 0);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <PackagingHeader />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.page}>
            <View style={styles.card}>
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
                label="Client + colour"
                placeholder="Select client + colour"
                sheetTitle="Client + colour"
                searchPlaceholder="Search"
                options={pallis.map((p) => ({ id: p.id, title: p.display_name }))}
                value={palliId}
                onChange={setPalliId}
                emptyText="No client + colour combinations yet"
              />
              <SelectField
                label="Bobbin colour"
                placeholder="Select bobbin colour"
                sheetTitle="Bobbin colour"
                searchable={false}
                options={bobbins.map((b) => ({ id: b.id, title: b.name }))}
                value={bobbinId}
                onChange={setBobbinId}
              />
              <SelectField
                label="Cone type"
                placeholder="Select cone type"
                sheetTitle="Cone type"
                searchable={false}
                options={cones.map((c) => ({ id: c.id, title: coneTypeShort(c), subtitle: coneTypeLabel(c) }))}
                value={coneId}
                onChange={setConeId}
              />

              {cone && target !== null ? (
                <View style={styles.spec}>
                  <Text style={styles.specMain}>Target {kg(target)} kg</Text>
                  <Text style={styles.specSub}>
                    {cone.bundle_count} cones × {kg(coneKg(cone))} kg per cone
                  </Text>
                </View>
              ) : null}
              {countId && coneId && bobbinId ? (
                <Text style={styles.poolText}>
                  {pool
                    ? `Loose stock available for this count, cone and bobbin colour: ${kg(pool.available_kg)} kg`
                    : 'No loose stock recorded for this count, cone type and bobbin colour.'}
                </Text>
              ) : null}

              <View style={styles.group}>
                <Text style={styles.label}>Weighed bag weight</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={weight}
                    onChangeText={(t) => {
                      setWeight(t.replace(/[^0-9.]/g, ''));
                      setError(null);
                    }}
                    placeholder="0.00"
                    placeholderTextColor={GateColors.textMuted}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Weighed bag weight in kilograms"
                  />
                  <Text style={styles.suffix}>kg</Text>
                </View>
                {diff !== null ? (
                  <Text style={[styles.diff, Math.abs(diff) > 1 && styles.diffWarn]}>
                    {diff === 0 ? 'Exactly on target' : `${diff > 0 ? '+' : '−'}${kg(Math.abs(diff))} kg ${diff > 0 ? 'over' : 'under'} target`}
                  </Text>
                ) : null}
              </View>

              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
              <GateButton label="Save bag" size="lg" loading={pack.isPending} onPress={submit} testID="save-bag-btn" />
            </View>

            {result ? (
              <View style={styles.result}>
                <Text style={styles.resultCode}>{result.bag_code}</Text>
                <Text style={styles.resultSub}>
                  {kg(result.net_weight_kg)} kg packed · target {kg(result.target_weight_kg)} kg
                </Text>
                <Text style={styles.resultSub}>
                  {countLabel(result.count_id)} · {palliName(result.palli_id)} · {bobbinName(result.bobbin_colour_id)} bobbin
                </Text>
              </View>
            ) : null}

            <View style={styles.listHead}>
              <Text style={styles.listTitle}>Packed today</Text>
              {bags.length > 0 ? (
                <Text style={styles.listCount}>
                  {bags.length} {bags.length === 1 ? 'bag' : 'bags'} · {kg(totalKg)} kg
                </Text>
              ) : null}
            </View>
            {today.isLoading ? (
              <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 16 }} />
            ) : bags.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No bags packed yet today.</Text>
              </View>
            ) : (
              bags.map((b) => (
                <View key={b.id} style={styles.bagRow}>
                  <View style={styles.bagText}>
                    <Text style={styles.bagCode}>{b.bag_code}</Text>
                    <Text style={styles.bagSub} numberOfLines={1}>
                      {countLabel(b.count_id)} · {palliName(b.palli_id)} · {bobbinName(b.bobbin_colour_id)}
                    </Text>
                  </View>
                  <Text style={styles.bagKg}>{kg(b.net_weight_kg)} kg</Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <Toast position="top" visible={toast.visible} message={toast.message} type={toast.type} onDismiss={() => setToast((t) => ({ ...t, visible: false }))} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: GateColors.surface0 },
  flex: { flex: 1 },
  scroll: { padding: 12, paddingBottom: 80 },
  page: { width: '100%', maxWidth: 640, alignSelf: 'center', gap: 12 },
  card: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.lg, padding: 16, gap: 14 },
  spec: { backgroundColor: GateColors.primaryLight, borderRadius: GateRadius.md, paddingHorizontal: 14, paddingVertical: 10, gap: 2 },
  specMain: { fontSize: 16, fontWeight: '800', color: GateColors.primary },
  specSub: { fontSize: 12, color: GateColors.textSecondary },
  poolText: { fontSize: 12, lineHeight: 17, color: GateColors.textSecondary },
  group: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: GateColors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: GateColors.surface2, borderWidth: 1.5, borderColor: GateColors.surface4, borderRadius: GateRadius.md, paddingHorizontal: 14 },
  input: { flex: 1, minWidth: 0, minHeight: 56, fontSize: 24, fontWeight: '800', color: GateColors.textPrimary },
  suffix: { fontSize: 15, fontWeight: '700', color: GateColors.textSecondary },
  diff: { fontSize: 13, fontWeight: '600', color: GateColors.success },
  diffWarn: { color: GateColors.warning },
  errorBox: { backgroundColor: GateColors.dangerLight, borderWidth: 1, borderColor: GateColors.danger, borderRadius: GateRadius.md, padding: 12 },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  result: { backgroundColor: GateColors.successLight, borderRadius: GateRadius.lg, padding: 16, alignItems: 'center', gap: 3 },
  resultCode: { fontSize: 24, fontWeight: '800', color: GateColors.success, letterSpacing: 0.5 },
  resultSub: { fontSize: 13, color: GateColors.textSecondary, textAlign: 'center' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  listTitle: { fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  listCount: { fontSize: 12, color: GateColors.textSecondary },
  empty: { backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderStyle: 'dashed', borderRadius: GateRadius.lg, padding: 22, alignItems: 'center' },
  emptyText: { fontSize: 13, color: GateColors.textSecondary },
  bagRow: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: GateColors.surface1, borderWidth: 1, borderColor: GateColors.surface3, borderRadius: GateRadius.md, paddingHorizontal: 14, paddingVertical: 11 },
  bagText: { flex: 1, minWidth: 0 },
  bagCode: { fontSize: 14, fontWeight: '800', color: GateColors.textPrimary },
  bagSub: { fontSize: 12, color: GateColors.textSecondary, marginTop: 1 },
  bagKg: { fontSize: 14, fontWeight: '800', color: GateColors.primary },
});
