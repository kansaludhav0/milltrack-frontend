/**
 * New mixing lot — pick the yarn count and the target weight. The recipe is the
 * company-wide standard recipe set by an admin; the server applies it, and this
 * screen only previews it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import React, { useState } from 'react';
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
import uuid from 'react-native-uuid';

import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import { createMixingLotApi, getLookupsApi } from '@/lib/api';
import { goBack } from '@/lib/navigation';

const cleanNumber = (t: string) => t.replace(/[^0-9.]/g, '');
const num = (t: string) => parseFloat(t) || 0;

export default function NewLotScreen() {
  const qc = useQueryClient();
  // Always re-read: an admin may have just configured (or changed) the standard recipe
  const {
    data: lookups,
    isLoading,
    isError,
    error: lookupsError,
    refetch,
  } = useQuery({ queryKey: ['lookups'], queryFn: getLookupsApi, staleTime: 0, refetchOnMount: 'always' });

  const recipe = lookups?.standard_mixing_recipe ?? [];
  const hasRecipe = recipe.length > 0;

  const [countId, setCountId] = useState<string | null>(null);
  const [targetText, setTargetText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const target = num(targetText);

  const { mutate: create, isPending } = useMutation({
    mutationFn: () =>
      createMixingLotApi({ id: uuid.v4() as string, count_id: countId!, target_weight_kg: target.toFixed(2) }),
    onSuccess: (lot) => {
      qc.invalidateQueries({ queryKey: ['mixing-lots'] });
      router.replace({ pathname: '/(godown)/wip', params: { lot: lot.id } } as never);
    },
    onError: (e: Error & { status?: number }) => {
      if (e.status === 409) qc.invalidateQueries({ queryKey: ['lookups'] });
      setError(
        e.status === 409
          ? `${e.message}. Ask an admin to set the standard mixing recipe, then try again.`
          : e.message || 'Could not create the lot.'
      );
    },
  });

  const submit = () => {
    setError(null);
    if (!countId) return setError('Choose the yarn count.');
    if (target <= 0) return setError('Enter the target weight in kg.');
    create();
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack('/(godown)/wip')} style={styles.backBtn} accessibilityLabel="Back">
          <Text style={styles.backText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New mixing lot</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {isLoading ? (
            <ActivityIndicator size="large" color={GateColors.primary} style={{ marginTop: 40 }} />
          ) : isError ? (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{(lookupsError as Error)?.message ?? 'Could not load the form.'}</Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <SelectField
                label="Yarn count"
                placeholder="Select yarn count"
                sheetTitle="Yarn count"
                searchable={false}
                options={(lookups?.yarn_counts ?? []).map((y) => ({ id: y.id, title: y.label }))}
                value={countId}
                onChange={setCountId}
                emptyText="No yarn counts available"
              />

              <View style={styles.group}>
                <Text style={styles.label}>Target weight</Text>
                <View style={styles.inputWrap}>
                  <TextInput
                    style={styles.input}
                    value={targetText}
                    onChangeText={(t) => setTargetText(cleanNumber(t))}
                    placeholder="0"
                    placeholderTextColor={GateColors.textMuted}
                    keyboardType="decimal-pad"
                    accessibilityLabel="Target weight in kilograms"
                  />
                  <Text style={styles.suffix}>kg</Text>
                </View>
              </View>

              <View style={styles.group}>
                <Text style={styles.label}>Standard recipe</Text>
                {hasRecipe ? (
                  <View style={styles.recipeCard}>
                    {recipe.map((line, i) => {
                      const pct = num(line.target_percentage);
                      return (
                        <View key={line.mixing_category_id} style={[styles.recipeRow, i > 0 && styles.recipeDivider]}>
                          <Text style={styles.catName} numberOfLines={1}>{line.category_name}</Text>
                          <Text style={styles.pctText}>{pct.toLocaleString('en-IN', { maximumFractionDigits: 2 })}%</Text>
                          <Text style={styles.kgText}>
                            {target > 0
                              ? ((target * pct) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })
                              : '–'}{' '}
                            kg
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <View style={styles.warnBox}>
                    <Text style={styles.warnTitle}>No standard recipe is set up</Text>
                    <Text style={styles.warnText}>
                      An admin needs to configure the standard mixing recipe before lots can be created.
                    </Text>
                  </View>
                )}
                <Text style={styles.hint}>
                  The recipe is set company-wide by an admin and applied to every new lot. Own waste is added later
                  from the mixing sheet.
                </Text>
              </View>

              {error ? (
                <View style={styles.errorBox} accessibilityRole="alert">
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}
            </>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <GateButton
            label="Create lot"
            size="lg"
            loading={isPending}
            onPress={submit}
            disabled={isLoading || isError || !hasRecipe}
          />
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: GateColors.surface1,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  backBtn: { paddingVertical: 6, width: 80 },
  backText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: GateColors.textPrimary },
  headerSpacer: { width: 80 },
  scroll: { padding: 16, gap: 18, width: '100%', maxWidth: 560, alignSelf: 'center' },
  group: { gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GateColors.surface2,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
  },
  input: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  suffix: { fontSize: 14, fontWeight: '700', color: GateColors.textSecondary },
  recipeCard: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
  },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  recipeDivider: { borderTopWidth: 1, borderTopColor: GateColors.surface3 },
  catName: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: '600', color: GateColors.textPrimary },
  pctText: { width: 64, textAlign: 'right', fontSize: 14, fontWeight: '700', color: GateColors.primary },
  kgText: { width: 96, textAlign: 'right', fontSize: 14, color: GateColors.textSecondary },
  hint: { fontSize: 12, lineHeight: 17, color: GateColors.textMuted },
  warnBox: {
    backgroundColor: GateColors.warningLight,
    borderRadius: GateRadius.md,
    padding: 14,
    gap: 4,
  },
  warnTitle: { fontSize: 14, fontWeight: '700', color: GateColors.warning },
  warnText: { fontSize: 13, lineHeight: 18, color: GateColors.warning },
  errorBox: {
    backgroundColor: GateColors.dangerLight,
    borderWidth: 1,
    borderColor: GateColors.danger,
    borderRadius: GateRadius.md,
    padding: 12,
    gap: 8,
  },
  errorText: { color: GateColors.danger, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  retry: { alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 12, borderRadius: GateRadius.md, backgroundColor: GateColors.surface1 },
  retryText: { color: GateColors.danger, fontWeight: '700', fontSize: 13 },
  footer: { padding: 16, backgroundColor: GateColors.surface1, borderTopWidth: 1, borderTopColor: GateColors.surface3 },
});
