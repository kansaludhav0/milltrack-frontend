import React, { useMemo, useState } from 'react';
import {
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

import { GateButton } from '@/components/gate/GateButton';
import { SelectField } from '@/components/gate/SelectField';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  QUALITY_GRADES,
  TARE_PRESET_GRAMS,
  TARE_SUGGESTION_MAX_GRAMS,
  validateTareGrams,
  type QualityGrade,
} from '@/lib/unload';
import type { LookupsResponse, VehicleStatusOut, VehicleUnloadConfig } from '@/lib/types';

interface Props {
  vehicle: VehicleStatusOut;
  lookups: LookupsResponse | undefined;
  /** Values to start from (the last setup, or the current config when editing). */
  initial: VehicleUnloadConfig;
  isEditing: boolean;
  /** Bales already weighed on this vehicle (shown when editing). */
  bales?: number;
  onBack: () => void;
  onStart: (config: VehicleUnloadConfig) => void;
}

/** 'other' means the tare is typed in manually (exceptions beyond the presets). */
type TareChoice = number | 'other' | null;

function initialTareChoice(grams: string): TareChoice {
  if (!grams) return null;
  const n = Number(grams);
  return (TARE_PRESET_GRAMS as readonly number[]).includes(n) ? n : 'other';
}

/**
 * Step 1 of unloading a vehicle: lock the constraints that apply to every bale
 * (godown, party, material, grade, tare). After this the worker only types
 * weights.
 */
export function UnloadSetup({ vehicle, lookups, initial, isEditing, bales = 0, onBack, onStart }: Props) {
  const [locationId, setLocationId] = useState(initial.godown_location_id);
  const [partyId, setPartyId] = useState(initial.party_id || vehicle.party_id || '');
  const [varietyId, setVarietyId] = useState(initial.material_variety_id || vehicle.material_variety_id || '');
  const [grade, setGrade] = useState<QualityGrade>(initial.quality_grade as QualityGrade);
  const [tareChoice, setTareChoice] = useState<TareChoice>(initialTareChoice(initial.tare_weight_grams));
  const [tareOther, setTareOther] = useState(
    initialTareChoice(initial.tare_weight_grams) === 'other' ? initial.tare_weight_grams : ''
  );
  const [submitted, setSubmitted] = useState(false);

  const tareGramsText = tareChoice === 'other' ? tareOther : tareChoice === null ? '' : String(tareChoice);
  const tareCheck = validateTareGrams(tareGramsText);

  const errors = useMemo(() => {
    return {
      location: !locationId ? 'Choose where the bales will be stored.' : undefined,
      party: !partyId ? 'Choose the party.' : undefined,
      variety: !varietyId ? 'Choose the material.' : undefined,
      tare: tareChoice === null ? 'Choose a tare weight.' : !tareCheck.ok ? tareCheck.message : undefined,
    };
  }, [locationId, partyId, varietyId, tareChoice, tareCheck]);
  const hasErrors = Object.values(errors).some(Boolean);

  const submit = () => {
    setSubmitted(true);
    if (hasErrors || !tareCheck.ok) return;
    onStart({
      party_id: partyId,
      material_variety_id: varietyId,
      godown_location_id: locationId,
      tare_weight_grams: String(tareCheck.grams),
      quality_grade: grade,
    });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn} accessibilityLabel="Back">
          <Text style={styles.backText}>← {isEditing ? 'Cancel' : 'Queue'}</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEditing ? 'Edit setup' : 'Unloading setup'}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.vehicleCard}>
            <Text style={styles.vehicleNumber}>{vehicle.vehicle_number}</Text>
            <Text style={styles.vehicleMeta} numberOfLines={2}>
              {[vehicle.entry_code, vehicle.driver_name, vehicle.approx_bale_count ? `~${vehicle.approx_bale_count} bales` : null]
                .filter(Boolean)
                .join(' · ')}
            </Text>
          </View>

          <Text style={styles.intro}>
            {isEditing && bales > 0
              ? `${bales} ${bales === 1 ? 'bale is' : 'bales are'} already weighed. If you change the tare you can update them too.`
              : 'These apply to every bale on this vehicle. Set them once, then just enter weights.'}
          </Text>

          <SelectField
            label="Store in godown"
            placeholder="Select godown"
            options={(lookups?.godown_locations ?? []).map((g) => ({ id: g.id, title: g.name, subtitle: g.code }))}
            value={locationId || null}
            onChange={(id) => setLocationId(id ?? '')}
            emptyText="No godowns available"
          />
          {submitted && errors.location ? <Text style={styles.error}>{errors.location}</Text> : null}

          <SelectField
            label="Party"
            placeholder="Select party"
            searchPlaceholder="Search by name or phone"
            options={(lookups?.parties ?? []).map((p) => ({ id: p.id, title: p.name, subtitle: p.contact_phone }))}
            value={partyId || null}
            onChange={(id) => setPartyId(id ?? '')}
            emptyText="No parties found"
          />
          {submitted && errors.party ? <Text style={styles.error}>{errors.party}</Text> : null}

          <SelectField
            label="Material"
            placeholder="Select material"
            options={(lookups?.material_varieties ?? []).map((v) => ({ id: v.id, title: v.name }))}
            value={varietyId || null}
            onChange={(id) => setVarietyId(id ?? '')}
            emptyText="No materials found"
          />
          {submitted && errors.variety ? <Text style={styles.error}>{errors.variety}</Text> : null}

          <View style={styles.group}>
            <Text style={styles.label}>Quality grade</Text>
            <View style={styles.gradeRow}>
              {QUALITY_GRADES.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.gradeBtn, grade === g && styles.chipActive]}
                  onPress={() => setGrade(g)}
                  accessibilityState={{ selected: grade === g }}
                >
                  <Text style={[styles.gradeText, grade === g && styles.chipTextActive]}>Grade {g}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <View style={styles.labelRow}>
              <Text style={styles.label}>Tare weight per bale</Text>
              <Text style={styles.unitTag}>grams</Text>
            </View>
            <View style={styles.tareGrid}>
              {TARE_PRESET_GRAMS.map((g) => (
                <TouchableOpacity
                  key={g}
                  style={[styles.tareChip, tareChoice === g && styles.chipActive]}
                  onPress={() => setTareChoice(g)}
                  accessibilityState={{ selected: tareChoice === g }}
                >
                  <Text style={[styles.tareChipText, tareChoice === g && styles.chipTextActive]}>{g} g</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.tareChip, tareChoice === 'other' && styles.chipActive]}
                onPress={() => setTareChoice('other')}
                accessibilityState={{ selected: tareChoice === 'other' }}
              >
                <Text style={[styles.tareChipText, tareChoice === 'other' && styles.chipTextActive]}>Other</Text>
              </TouchableOpacity>
            </View>

            {tareChoice === 'other' ? (
              <View style={styles.otherWrap}>
                <TextInput
                  style={styles.otherInput}
                  value={tareOther}
                  onChangeText={(t) => setTareOther(t.replace(/[^0-9.]/g, ''))}
                  placeholder="Tare in grams"
                  placeholderTextColor={GateColors.textMuted}
                  keyboardType="decimal-pad"
                  autoFocus
                  accessibilityLabel="Tare weight in grams"
                />
                <Text style={styles.otherSuffix}>g</Text>
              </View>
            ) : null}

            {tareCheck.ok && tareCheck.exceedsSuggestion ? (
              <Text style={styles.warning}>
                {tareCheck.grams} g is above the usual {TARE_SUGGESTION_MAX_GRAMS} g. Check it is correct before
                starting.
              </Text>
            ) : null}
            {submitted && errors.tare ? <Text style={styles.error}>{errors.tare}</Text> : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <GateButton
            label={isEditing ? 'Save changes' : 'Start unloading'}
            size="lg"
            onPress={submit}
            testID="start-unloading-btn"
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
  backBtn: { paddingVertical: 6, paddingHorizontal: 4, width: 80 },
  backText: { fontSize: 14, fontWeight: '600', color: GateColors.textSecondary },
  headerTitle: { fontSize: 17, fontWeight: '700', color: GateColors.textPrimary },
  headerSpacer: { width: 80 },
  scroll: {
    padding: 16,
    paddingBottom: 24,
    gap: 16,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  vehicleCard: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    padding: 16,
    gap: 4,
  },
  vehicleNumber: { fontSize: 22, fontWeight: '800', color: GateColors.textPrimary, letterSpacing: 0.3 },
  vehicleMeta: { fontSize: 13, color: GateColors.textSecondary },
  intro: { fontSize: 13, lineHeight: 18, color: GateColors.textSecondary },
  group: { gap: 8 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  unitTag: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.primary,
    backgroundColor: GateColors.primaryLight,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: GateRadius.full,
    overflow: 'hidden',
  },
  gradeRow: { flexDirection: 'row', gap: 10 },
  gradeBtn: {
    flex: 1,
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface2,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  gradeText: { fontSize: 15, fontWeight: '600', color: GateColors.textSecondary },
  tareGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tareChip: {
    flexGrow: 1,
    flexBasis: '28%',
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface2,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
  },
  tareChipText: { fontSize: 16, fontWeight: '600', color: GateColors.textPrimary },
  chipActive: { backgroundColor: GateColors.primaryLight, borderColor: GateColors.primary },
  chipTextActive: { color: GateColors.primary, fontWeight: '700' },
  otherWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GateColors.surface1,
    borderWidth: 1.5,
    borderColor: GateColors.primary,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
  },
  otherInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 18, fontWeight: '700', color: GateColors.textPrimary },
  otherSuffix: { fontSize: 15, fontWeight: '700', color: GateColors.textSecondary },
  warning: {
    fontSize: 13,
    lineHeight: 18,
    color: GateColors.warning,
    backgroundColor: GateColors.warningLight,
    borderRadius: GateRadius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  error: { fontSize: 12, fontWeight: '500', color: GateColors.danger, marginTop: -8 },
  footer: {
    padding: 16,
    backgroundColor: GateColors.surface1,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
  },
});
