import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { GateButton } from '@/components/gate/GateButton';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { getLookupsApi, setMixingRecipeApi } from '@/lib/api';

const PREVIEW_KG = 5000;
const cleanNumber = (t: string) => t.replace(/[^0-9.]/g, '');
const num = (t: string | undefined) => parseFloat(t ?? '') || 0;
const pctText = (v: string | number) => String(parseFloat(String(v)) || 0);

interface Props {
  onToast: (message: string, type: 'success' | 'error') => void;
}

/**
 * The ONE company-wide mixing recipe: a percentage per FIBRE column. It is
 * applied by the server to every new mixing lot (existing lots are unchanged).
 */
export function MixingRecipeEditor({ onToast }: Props) {
  const qc = useQueryClient();
  const { data: lookups, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const fibre = [...(lookups?.mixing_categories ?? [])]
    .filter((c) => c.kind === 'FIBRE')
    .sort((a, b) => a.sort_order - b.sort_order);
  const saved = lookups?.standard_mixing_recipe ?? [];
  const savedPct = (id: string) => {
    const line = saved.find((l) => l.mixing_category_id === id);
    return line ? pctText(line.target_percentage) : '';
  };

  // Only the fields the admin has typed into; everything else shows the saved value.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const value = (id: string) => edits[id] ?? savedPct(id);

  const total = fibre.reduce((s, c) => s + num(value(c.id)), 0);
  const totalOk = Math.abs(total - 100) < 0.005;
  const dirty = fibre.some((c) => num(value(c.id)) !== num(savedPct(c.id)));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const { mutate: save, isPending } = useMutation({
    mutationFn: () =>
      setMixingRecipeApi(
        fibre
          .filter((c) => num(value(c.id)) > 0)
          .map((c) => ({ mixing_category_id: c.id, target_percentage: num(value(c.id)).toFixed(2) }))
      ),
    onSuccess: async () => {
      setConfirmOpen(false);
      setEdits({});
      setFormError(null);
      await qc.invalidateQueries({ queryKey: ['lookups'] });
      onToast('Standard mixing recipe saved. It applies to new lots.', 'success');
    },
    onError: (e: Error) => {
      setConfirmOpen(false);
      setFormError(e.message || 'Could not save the recipe.');
    },
  });

  const askSave = () => {
    setFormError(null);
    if (!fibre.some((c) => num(value(c.id)) > 0)) return setFormError('Enter a percentage for at least one column.');
    if (!totalOk) return setFormError(`Percentages add up to ${total.toFixed(2)}%. They must total 100%.`);
    setConfirmOpen(true);
  };

  if (isLoading) return <ActivityIndicator size="small" color={GateColors.primary} style={{ marginVertical: 32 }} />;
  if (isError)
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Could not load the recipe</Text>
        <Text style={styles.sub}>{(error as Error)?.message ?? 'Something went wrong.'}</Text>
        <TouchableOpacity style={styles.linkBtn} onPress={() => refetch()}>
          <Text style={styles.linkText}>Try again</Text>
        </TouchableOpacity>
      </View>
    );

  return (
    <View style={styles.wrap}>
      <View>
        <Text style={styles.heading}>Standard mixing recipe</Text>
        <Text style={styles.headingSub}>
          One recipe for the whole company. It is applied to every new mixing lot, so godown managers only choose the
          yarn count and target weight. Lots that already exist keep their recipe.
        </Text>
      </View>

      {saved.length === 0 ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>
            No recipe is configured yet. Godown managers cannot create mixing lots until you save one.
          </Text>
        </View>
      ) : null}

      <View style={styles.card}>
        <View style={styles.head}>
          <Text style={[styles.th, { flex: 1 }]}>Column</Text>
          <Text style={[styles.th, styles.pctCol]}>Percent</Text>
          <Text style={[styles.th, styles.kgCol]}>Per {PREVIEW_KG.toLocaleString('en-IN')} kg</Text>
        </View>
        {fibre.map((c) => {
          const p = num(value(c.id));
          return (
            <View key={c.id} style={styles.row}>
              <Text style={styles.catName} numberOfLines={1}>{c.name}</Text>
              <View style={styles.pctWrap}>
                <TextInput
                  style={styles.pctInput}
                  value={value(c.id)}
                  onChangeText={(t) => {
                    setFormError(null);
                    setEdits((m) => ({ ...m, [c.id]: cleanNumber(t) }));
                  }}
                  placeholder="0"
                  placeholderTextColor={GateColors.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel={`${c.name} percentage`}
                />
                <Text style={styles.suffix}>%</Text>
              </View>
              <Text style={styles.kgText}>
                {p > 0 ? ((PREVIEW_KG * p) / 100).toLocaleString('en-IN', { maximumFractionDigits: 1 }) : '–'} kg
              </Text>
            </View>
          );
        })}
        {fibre.length === 0 ? <Text style={styles.empty}>No fibre columns are configured.</Text> : null}
        <View style={[styles.row, styles.totalRow]}>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={[styles.totalValue, totalOk ? styles.ok : total > 0 && styles.bad]}>
            {total.toLocaleString('en-IN', { maximumFractionDigits: 2 })}% of 100%
          </Text>
        </View>
      </View>
      <Text style={styles.hint}>Own waste is not part of the recipe. It is added per lot from the mixing sheet.</Text>

      {formError ? (
        <View style={styles.errorBox} accessibilityRole="alert">
          <Text style={styles.errorText}>{formError}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <GateButton
          label="Discard changes"
          variant="ghost"
          disabled={!dirty || isPending}
          onPress={() => {
            setEdits({});
            setFormError(null);
          }}
          style={styles.flex1}
        />
        <GateButton
          label="Save recipe"
          loading={isPending}
          disabled={!dirty || isPending || fibre.length === 0}
          onPress={askSave}
          style={styles.flex1}
        />
      </View>

      <ConfirmDialog
        visible={confirmOpen}
        title="Save the standard recipe?"
        message="Every new mixing lot will use these percentages. Lots that already exist are not changed."
        confirmLabel="Save recipe"
        loading={isPending}
        onConfirm={() => save()}
        onCancel={() => setConfirmOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  flex1: { flex: 1 },
  heading: { fontSize: 20, fontWeight: '700', color: GateColors.textPrimary },
  headingSub: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary, marginTop: 4 },
  notice: { backgroundColor: GateColors.warningLight, borderRadius: GateRadius.md, padding: 12 },
  noticeText: { fontSize: 13, lineHeight: 18, color: GateColors.warning },
  card: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    borderRadius: GateRadius.lg,
    overflow: 'hidden',
  },
  title: { fontSize: 15, fontWeight: '700', color: GateColors.textPrimary, padding: 16, paddingBottom: 4 },
  sub: { fontSize: 13, color: GateColors.textSecondary, paddingHorizontal: 16 },
  linkBtn: { padding: 16 },
  linkText: { color: GateColors.primary, fontWeight: '700' },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: GateColors.surface2,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  th: { fontSize: 11, fontWeight: '700', color: GateColors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3 },
  pctCol: { width: 96, textAlign: 'left' },
  kgCol: { width: 92, textAlign: 'right' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  catName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: GateColors.textPrimary },
  pctWrap: {
    width: 96,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GateColors.surface2,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 10,
  },
  pctInput: { flex: 1, minWidth: 0, minHeight: 42, fontSize: 16, fontWeight: '700', color: GateColors.textPrimary },
  suffix: { fontSize: 14, fontWeight: '700', color: GateColors.textSecondary },
  kgText: { width: 92, textAlign: 'right', fontSize: 13, color: GateColors.textSecondary },
  totalRow: { borderBottomWidth: 0, justifyContent: 'space-between', backgroundColor: GateColors.surface0 },
  totalLabel: { fontSize: 14, fontWeight: '800', color: GateColors.textPrimary },
  totalValue: { fontSize: 14, fontWeight: '800', color: GateColors.textSecondary },
  ok: { color: GateColors.success },
  bad: { color: GateColors.danger },
  empty: { padding: 16, color: GateColors.textMuted, textAlign: 'center' },
  hint: { fontSize: 12, color: GateColors.textMuted },
  errorBox: {
    backgroundColor: GateColors.dangerLight,
    borderWidth: 1,
    borderColor: GateColors.danger,
    borderRadius: GateRadius.md,
    padding: 12,
  },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  actions: { flexDirection: 'row', gap: 10 },
});
