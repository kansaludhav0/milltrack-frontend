import AsyncStorage from '@react-native-async-storage/async-storage';

import { ASYNC_KEYS } from './constants';
import type { BaleOut, VehicleUnloadConfig } from './types';

/**
 * Tare is the weight of a bale's wrapper/straps and is measured in GRAMS.
 * The quick-pick suggestions never exceed TARE_SUGGESTION_MAX_GRAMS; anything
 * heavier is an exception and is typed in manually.
 */
export const TARE_SUGGESTION_MAX_GRAMS = 500;
export const TARE_PRESET_GRAMS = [100, 200, 300, 400, 500] as const;

/** Bale (gross) weights are entered in KILOGRAMS. */
export const QUALITY_GRADES = ['A', 'B', 'C'] as const;
export type QualityGrade = (typeof QUALITY_GRADES)[number];

export type TareValidation =
  | { ok: true; grams: number; exceedsSuggestion: boolean }
  | { ok: false; message: string };

/** Validate a tare typed as grams. Heavier than the suggestion limit is allowed but flagged. */
export function validateTareGrams(input: string): TareValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, message: 'Enter the tare weight in grams.' };
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return { ok: false, message: 'Tare must be a number in grams.' };
  const grams = parseFloat(trimmed);
  if (grams <= 0) return { ok: false, message: 'Tare must be greater than 0 g.' };
  if (grams >= 100000) return { ok: false, message: 'That tare looks wrong. Enter it in grams (1 kg = 1000 g).' };
  return { ok: true, grams, exceedsSuggestion: grams > TARE_SUGGESTION_MAX_GRAMS };
}

/** What the worker chose last time, so the next vehicle starts pre-filled. */
export interface LastUnloadSetup {
  godown_location_id: string;
  tare_weight_grams: string;
  quality_grade: QualityGrade;
}

export async function getLastUnloadSetup(): Promise<LastUnloadSetup | null> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEYS.LAST_UNLOAD_SETUP);
    return raw ? (JSON.parse(raw) as LastUnloadSetup) : null;
  } catch {
    return null;
  }
}

export async function saveLastUnloadSetup(setup: LastUnloadSetup): Promise<void> {
  try {
    await AsyncStorage.setItem(ASYNC_KEYS.LAST_UNLOAD_SETUP, JSON.stringify(setup));
  } catch {
    // Non-critical convenience; ignore storage failures.
  }
}

/** The setup chosen for one specific vehicle, so reopening it skips straight to the bales. */
export async function getEntrySetup(entryId: string): Promise<VehicleUnloadConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEYS.UNLOAD_SETUP_PREFIX + entryId);
    return raw ? (JSON.parse(raw) as VehicleUnloadConfig) : null;
  } catch {
    return null;
  }
}

export async function saveEntrySetup(entryId: string, setup: VehicleUnloadConfig): Promise<void> {
  try {
    await AsyncStorage.setItem(ASYNC_KEYS.UNLOAD_SETUP_PREFIX + entryId, JSON.stringify(setup));
  } catch {
    // Non-critical: the setup can still be recovered from the vehicle's bales.
  }
}

/** Rebuild a vehicle's setup from a bale already weighed for it (works on any device). */
export function configFromBale(bale: BaleOut): VehicleUnloadConfig {
  const grams = Math.round((parseFloat(bale.tare_weight_kg) || 0) * 1000);
  return {
    party_id: bale.party_id,
    material_variety_id: bale.material_variety_id,
    godown_location_id: bale.godown_location_id,
    tare_weight_grams: String(grams),
    quality_grade: bale.quality_grade,
  };
}
