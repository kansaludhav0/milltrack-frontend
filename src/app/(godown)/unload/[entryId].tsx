/**
 * Vehicle Bale Unloading & QR Printing Screen — ultra-simple single-screen flow for Godown Managers & Labor.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { ConfirmDialog } from '@/components/gate/ConfirmDialog';
import { UnloadSetup } from '@/components/godown/UnloadSetup';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  createBaleApi,
  finishUnloadingApi,
  getBalesForEntryApi,
  getLookupsApi,
  getUnloadingQueueApi,
  printBaleApi,
  retareEntryBalesApi,
  voidBaleApi,
} from '@/lib/api';
import type { BaleIn, BaleOut, VehicleStatusOut, VehicleUnloadConfig } from '@/lib/types';
import { printBaleLabel } from '@/lib/printLabel';
import {
  configFromBale,
  getEntrySetup,
  getLastUnloadSetup,
  saveEntrySetup,
  saveLastUnloadSetup,
  type LastUnloadSetup,
} from '@/lib/unload';

const EMPTY_CONFIG: VehicleUnloadConfig = {
  party_id: '',
  material_variety_id: '',
  godown_location_id: '',
  tare_weight_grams: '',
  quality_grade: 'A',
};

export default function VehicleUnloadScreen() {
  const { entryId } = useLocalSearchParams<{ entryId: string }>();
  const qc = useQueryClient();

  // ─── Toast Feedback ────────────────────────────────────────────────────────
  const [toast, setToast] = useState<{ visible: boolean; message: string; type: 'success' | 'error' }>({
    visible: false,
    message: '',
    type: 'success',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ visible: true, message, type });
  };

  // ─── Fetch Lookups ─────────────────────────────────────────────────────────
  const { data: lookups } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Fetch Vehicle Entry Details ───────────────────────────────────────────
  const { data: vehicles = [], isLoading: queueLoading } = useQuery({
    queryKey: ['unloading-queue'],
    queryFn: getUnloadingQueueApi,
  });

  const vehicle: VehicleStatusOut | undefined = useMemo(() => {
    return vehicles.find((v) => (v.gate_entry_id || v.id) === entryId);
  }, [vehicles, entryId]);

  // ─── Fetch Bales for this Vehicle ──────────────────────────────────────────
  const {
    data: bales = [],
    isLoading: balesLoading,
  } = useQuery({
    queryKey: ['bales-for-entry', entryId],
    queryFn: () => getBalesForEntryApi(entryId!),
    enabled: !!entryId,
  });

  // ─── Vehicle Constraints ───────────────────────────────────────────────────
  // Tare is in GRAMS (bale weights are in KG). The setup for a vehicle is
  // resolved, in order, from: what the worker just chose, what was saved for
  // this vehicle, or the latest bale already weighed for it. If none exist the
  // setup form is shown; otherwise the bales open directly.
  const [userConfig, setUserConfig] = useState<VehicleUnloadConfig | null>(null);
  const [storedSetup, setStoredSetup] = useState<VehicleUnloadConfig | null | undefined>(undefined);
  const [lastSetup, setLastSetup] = useState<LastUnloadSetup | null | undefined>(undefined);
  const [isEditingSetup, setIsEditingSetup] = useState(false);
  const [pendingSetup, setPendingSetup] = useState<VehicleUnloadConfig | null>(null);

  useEffect(() => {
    getLastUnloadSetup().then(setLastSetup);
  }, []);
  useEffect(() => {
    if (entryId) getEntrySetup(entryId).then(setStoredSetup);
  }, [entryId]);

  const latestBale = useMemo(
    () =>
      bales.length
        ? bales.reduce((a, b) => (new Date(b.created_at) > new Date(a.created_at) ? b : a))
        : null,
    [bales]
  );
  const resolvedConfig = userConfig ?? storedSetup ?? (latestBale ? configFromBale(latestBale) : null);
  const config: VehicleUnloadConfig = resolvedConfig ?? EMPTY_CONFIG;
  const isConfigured = resolvedConfig !== null;
  const setupReady = !queueLoading && !balesLoading && lastSetup !== undefined && storedSetup !== undefined;

  // Party / material come from the setup step (pre-filled from the gate entry)
  const effectivePartyId = config.party_id;
  const effectiveVarietyId = config.material_variety_id;

  // Tare in kilograms for net calculations & the backend payload
  const tareGrams = parseFloat(config.tare_weight_grams) || 0;
  const tareKg = tareGrams / 1000;

  // ─── Next Bale Entry State ─────────────────────────────────────────────────
  const [grossWeightInput, setGrossWeightInput] = useState('');
  const weightInputRef = useRef<TextInput>(null);

  // ─── QR Code Sticker Modal State ───────────────────────────────────────────
  const [activeBaleSticker, setActiveBaleSticker] = useState<BaleOut | null>(null);

  // ─── Add Bale Mutation ─────────────────────────────────────────────────────
  const {
    mutate: addBale,
    isPending: isAddingBale,
    reset: resetAddBale,
  } = useMutation({
    mutationFn: async () => {
      const grossKg = parseFloat(grossWeightInput.trim());

      if (isNaN(grossKg) || grossKg <= 0) {
        throw new Error('Please enter a valid gross weight in kg (e.g. 165.5).');
      }
      if (grossKg <= tareKg) {
        throw new Error(
          `Gross weight (${grossKg} kg) must be greater than the tare (${tareGrams} g).`
        );
      }

      const payload: BaleIn = {
        id: uuid.v4() as string,
        gate_entry_id: entryId!,
        gross_weight_kg: grossKg.toFixed(2),
        tare_weight_kg: tareKg.toFixed(3),
        quality_grade: config.quality_grade,
        material_variety_id: config.material_variety_id || effectiveVarietyId,
        party_id: config.party_id || effectivePartyId,
        godown_location_id: config.godown_location_id,
      };

      return createBaleApi(payload);
    },
    onSuccess: (newBale) => {
      qc.invalidateQueries({ queryKey: ['bales-for-entry', entryId] });
      setGrossWeightInput('');
      resetAddBale();
      // Keep the worker in the weighing rhythm: no popup, just focus back on the input.
      showToast(`${newBale.bale_code} saved · net ${parseFloat(newBale.net_weight_kg).toFixed(1)} kg`, 'success');
      // No button, no extra tap: print the label straight away.
      printBaleLabel(newBale).catch(() =>
        showToast(`${newBale.bale_code} saved, but its label did not print. Tap the bale to reprint.`, 'error')
      );
      setTimeout(() => weightInputRef.current?.focus(), 50);
    },
    onError: (err: any) => {
      showToast(err.message || 'Failed to add bale.', 'error');
    },
  });

  // ─── Reprint (damaged / lost label). The FIRST print is automatic. ──────────
  const [reprint, setReprint] = useState<{ baleId: string; state: 'busy' | 'ok' | 'error'; message?: string } | null>(null);
  const handleReprint = async (bale: BaleOut) => {
    setReprint({ baleId: bale.id, state: 'busy' });
    try {
      await printBaleLabel(bale);
      await printBaleApi(bale.id); // log the reprint
      qc.invalidateQueries({ queryKey: ['bales-for-entry', entryId] });
      setReprint({ baleId: bale.id, state: 'ok', message: 'Reprint sent.' });
    } catch (err) {
      setReprint({ baleId: bale.id, state: 'error', message: (err as Error).message || 'Could not print the label.' });
    }
  };

  // Finish unloading: the vehicle leaves the queue (gate exit stays the gateman's job)
  const [finishOpen, setFinishOpen] = useState(false);
  const { mutate: finishUnloading, isPending: isFinishing } = useMutation({
    mutationFn: () => finishUnloadingApi(entryId!),
    onSuccess: () => {
      setFinishOpen(false);
      qc.invalidateQueries({ queryKey: ['unloading-queue'] });
      router.replace('/(godown)' as never);
    },
    onError: (err: Error) => {
      setFinishOpen(false);
      showToast(err.message || 'Could not finish unloading.', 'error');
    },
  });

  // Void a mistyped bale (there is no delete; the server keeps a record)
  const [voidTarget, setVoidTarget] = useState<BaleOut | null>(null);
  const { mutate: voidBale, isPending: isVoiding } = useMutation({
    mutationFn: (bale: BaleOut) => voidBaleApi(bale.id),
    onSuccess: (_r, bale) => {
      setVoidTarget(null);
      qc.invalidateQueries({ queryKey: ['bales-for-entry', entryId] });
      qc.invalidateQueries({ queryKey: ['godown-inventory'] });
      showToast(`${bale.bale_code} voided`, 'success');
    },
    onError: (err: Error) => {
      setVoidTarget(null);
      showToast(err.message || 'Could not void the bale.', 'error');
    },
  });

  const applySetup = (next: VehicleUnloadConfig) => {
    setUserConfig(next);
    setIsEditingSetup(false);
    setPendingSetup(null);
    if (entryId) saveEntrySetup(entryId, next);
    saveLastUnloadSetup({
      godown_location_id: next.godown_location_id,
      tare_weight_grams: next.tare_weight_grams,
      quality_grade: next.quality_grade as LastUnloadSetup['quality_grade'],
    });
    setTimeout(() => weightInputRef.current?.focus(), 350);
  };

  const handleSetupSubmit = (next: VehicleUnloadConfig) => {
    const tareChanged = isEditingSetup && next.tare_weight_grams !== config.tare_weight_grams;
    if (tareChanged && bales.length > 0) {
      setPendingSetup(next); // ask whether the bales already weighed should change too
      return;
    }
    applySetup(next);
  };

  // Change the tare on bales that were already weighed (needs backend support)
  const { mutate: retareBales, isPending: isRetaring } = useMutation({
    mutationFn: async (next: VehicleUnloadConfig) =>
      retareEntryBalesApi(entryId!, (parseFloat(next.tare_weight_grams) / 1000).toFixed(3)),
    onSuccess: (_updated, next) => {
      qc.invalidateQueries({ queryKey: ['bales-for-entry', entryId] });
      qc.invalidateQueries({ queryKey: ['godown-inventory'] });
      applySetup(next);
      showToast(`Tare updated on ${bales.length} ${bales.length === 1 ? 'bale' : 'bales'}`, 'success');
    },
    onError: (err: Error) => {
      setPendingSetup(null);
      showToast(`Could not update the bales already weighed: ${err.message}`, 'error');
    },
  });

  const tareDialog = (
    <ConfirmDialog
      visible={!!pendingSetup}
      title="Update tare on existing bales?"
      message={
        pendingSetup
          ? `Tare changes from ${config.tare_weight_grams} g to ${pendingSetup.tare_weight_grams} g. ${bales.length} ${bales.length === 1 ? 'bale is' : 'bales are'} already weighed on this vehicle.`
          : ''
      }
      confirmLabel={bales.length === 1 ? 'Update this bale' : `Update all ${bales.length} bales`}
      secondaryLabel="New bales only"
      cancelLabel="Cancel"
      loading={isRetaring}
      onConfirm={() => pendingSetup && retareBales(pendingSetup)}
      onSecondary={() => pendingSetup && applySetup(pendingSetup)}
      onCancel={() => setPendingSetup(null)}
    />
  );

  const voidDialog = (
    <ConfirmDialog
      visible={!!voidTarget}
      title={`Void ${voidTarget?.bale_code ?? 'bale'}?`}
      message={
        voidTarget
          ? `Gross ${parseFloat(voidTarget.gross_weight_kg).toFixed(1)} kg will be removed from stock. Use this only for a wrong entry. It can't be undone, and a bale already in a mixing lot can't be voided.`
          : ''
      }
      confirmLabel="Void bale"
      confirmVariant="danger"
      loading={isVoiding}
      onConfirm={() => voidTarget && voidBale(voidTarget)}
      onCancel={() => setVoidTarget(null)}
    />
  );

  // ─── Totals Calculation ────────────────────────────────────────────────────
  const totalBales = bales.length;
  const totalNetKg = useMemo(() => {
    return bales.reduce((sum, b) => sum + (parseFloat(b.net_weight_kg) || 0), 0);
  }, [bales]);

  // Names from IDs
  const partyName =
    lookups?.parties.find((p) => p.id === effectivePartyId)?.name ??
    vehicle?.party_name ??
    'Select Party';
  const varietyName =
    lookups?.material_varieties.find((v) => v.id === effectiveVarietyId)?.name ??
    vehicle?.material_variety_name ??
    'Select Variety';
  const godownName =
    lookups?.godown_locations?.find((g) => g.id === config.godown_location_id)?.name ??
    'Select Godown';

  // Live Net Preview
  const parsedGross = parseFloat(grossWeightInput);
  const netPreview = !isNaN(parsedGross) && parsedGross > tareKg ? (parsedGross - tareKg).toFixed(1) : null;

  // ─── Return to Queue Navigation Handler ───────────────────────────────────
  const handleBackToQueue = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(godown)' as any);
    }
  };

  const toastEl = (
    <Toast
      position="top"
      visible={toast.visible}
      message={toast.message}
      type={toast.type}
      onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
    />
  );

  if (!setupReady) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerLoading}>
          <ActivityIndicator size="large" color={GateColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // ─── Setup form: only for a vehicle with no setup yet, or when editing ─────
  if (!isConfigured || isEditingSetup) {
    if (!vehicle) {
      return (
        <SafeAreaView style={styles.safe} edges={['top']}>
          <View style={styles.centerLoading}>
            <Text style={styles.emptyTitle}>Vehicle not in the unloading queue</Text>
            <Text style={styles.emptySub}>It may already be unloaded, or the entry was removed.</Text>
            <TouchableOpacity onPress={handleBackToQueue} style={styles.setupBtn}>
              <Text style={styles.setupBtnText}>Back to queue</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    const initial: VehicleUnloadConfig = isEditingSetup
      ? config
      : {
          party_id: vehicle.party_id ?? '',
          material_variety_id: vehicle.material_variety_id ?? '',
          godown_location_id: lastSetup?.godown_location_id ?? '',
          tare_weight_grams: lastSetup?.tare_weight_grams ?? '',
          quality_grade: lastSetup?.quality_grade ?? 'A',
        };

    return (
      <>
        <UnloadSetup
          vehicle={vehicle}
          lookups={lookups}
          initial={initial}
          isEditing={isEditingSetup}
          bales={bales.length}
          onBack={isEditingSetup ? () => setIsEditingSetup(false) : handleBackToQueue}
          onStart={handleSetupSubmit}
        />
        {tareDialog}
        {toastEl}
      </>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* ─── Top Header ──────────────────────────────────────────────────── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBackToQueue} style={styles.backBtn} activeOpacity={0.7}>
          <Text style={styles.backBtnText}>← Queue</Text>
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerVehicleNumber}>{vehicle?.vehicle_number ?? 'Vehicle'}</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {partyName} • {varietyName}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.setupBtn}
          onPress={() => setIsEditingSetup(true)}
          activeOpacity={0.7}
        >
          <Text style={styles.setupBtnText}>Setup</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Status & Totals Banner ──────────────────────────────────────── */}
      <View style={styles.statsBanner}>
        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Bales Unloaded</Text>
          <View style={styles.statValueRow}>
            <Text style={styles.statBigValue}>{totalBales}</Text>
            {vehicle?.approx_bale_count ? (
              <Text style={styles.statSubValue}>/ ~{vehicle.approx_bale_count}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Total Net Weight</Text>
          <Text style={styles.statBigWeight}>
            {totalNetKg.toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}{' '}
            <Text style={styles.statUnit}>kg</Text>
          </Text>
        </View>

        <View style={styles.statDivider} />

        <View style={styles.statBox}>
          <Text style={styles.statLabel}>Tare / bale</Text>
          <Text style={styles.statPresetText}>{config.tare_weight_grams} g</Text>
          <Text style={styles.statTareKgSub}>({tareKg.toFixed(2)} kg)</Text>
          <Text style={styles.statLocationText} numberOfLines={1}>
            {godownName}
          </Text>
        </View>
      </View>

      {/* ─── Finish unloading ────────────────────────────────────────────── */}
      <View style={styles.finishBar}>
        <Text style={styles.finishText}>All bales weighed?</Text>
        <TouchableOpacity
          style={styles.finishBtn}
          onPress={() => setFinishOpen(true)}
          disabled={isFinishing}
          accessibilityLabel="Finish unloading"
          testID="finish-unloading-btn"
        >
          <Text style={styles.finishBtnText}>Finish unloading</Text>
        </TouchableOpacity>
      </View>

      {/* ─── Main Content with Keyboard Handling ──────────────────────────── */}
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* ─── Bales List ─────────────────────────────────────────────────── */}
        {balesLoading ? (
          <View style={styles.centerLoading}>
            <ActivityIndicator size="large" color={GateColors.primary} />
            <Text style={styles.centerLoadingText}>Loading unloaded bales…</Text>
          </View>
        ) : bales.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyTitle}>Ready to Unload Bales</Text>
            <Text style={styles.emptySub}>
              Type each bale&apos;s gross weight in kg below and tap &quot;Add Bale&quot;. Tare is applied automatically.
            </Text>
          </View>
        ) : (
          <FlatList
            style={styles.listFlex}
            data={[...bales].reverse()}
            keyExtractor={(b) => b.id}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item, index }) => {
              const baleNum = bales.length - index;
              const gross = parseFloat(item.gross_weight_kg).toFixed(1);
              const tareG = Math.round((parseFloat(item.tare_weight_kg) || 0) * 1000);
              const net = parseFloat(item.net_weight_kg).toFixed(1);

              return (
                <TouchableOpacity
                  style={styles.baleCard}
                  onPress={() => setActiveBaleSticker(item)}
                  activeOpacity={0.8}
                >
                  <View style={styles.baleCardLeft}>
                    <View style={styles.baleIndexBadge}>
                      <Text style={styles.baleIndexText}>#{baleNum}</Text>
                    </View>

                    <View style={styles.baleCardInfo}>
                      <View style={styles.baleCodeRow}>
                        <Text style={styles.baleCode}>{item.bale_code}</Text>
                        <View style={styles.gradeBadge}>
                          <Text style={styles.gradeBadgeText}>Grade {item.quality_grade}</Text>
                        </View>
                      </View>

                      <Text style={styles.weightDetails}>
                        Gross: <Text style={styles.weightNum}>{gross} kg</Text> • Tare: {tareG} g
                      </Text>
                    </View>
                  </View>

                  <View style={styles.baleCardRight}>
                    <Text style={styles.netWeightBig}>{net} kg</Text>
                    <Text style={styles.labelHint}>Label ›</Text>
                    <TouchableOpacity
                      onPress={(e) => {
                        e.stopPropagation?.();
                        setVoidTarget(item);
                      }}
                      hitSlop={8}
                      accessibilityLabel={`Void ${item.bale_code}`}
                    >
                      <Text style={styles.voidText}>Void</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}

        {/* ─── Bottom Add-Bale Bar (Pinned for Labor Ease) ───────────────── */}
        <View style={styles.bottomBar}>
          <View style={styles.bottomBarTopRow}>
            <Text style={styles.nextBaleLabel}>Next: Bale #{bales.length + 1}</Text>
            {netPreview ? (
              <Text style={styles.calcNetPreview}>
                Net: {netPreview} kg ({parsedGross} kg - {config.tare_weight_grams}g)
              </Text>
            ) : (
              <Text style={styles.tareGuideText}>Tare preset: {config.tare_weight_grams} g</Text>
            )}
          </View>

          <View style={styles.inputAndActionRow}>
            <View style={styles.weightInputWrap}>
              <TextInput
                ref={weightInputRef}
                style={styles.weightInput}
                value={grossWeightInput}
                onChangeText={setGrossWeightInput}
                placeholder="0.0"
                placeholderTextColor={GateColors.textMuted}
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={() => addBale()}
              />
              <Text style={styles.weightUnitSuffix}>kg</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.addBaleActionBtn,
                (!grossWeightInput.trim() || isAddingBale) && styles.addBaleActionBtnDisabled,
              ]}
              disabled={!grossWeightInput.trim() || isAddingBale}
              onPress={() => addBale()}
              activeOpacity={0.8}
            >
              {isAddingBale ? (
                <ActivityIndicator size="small" color={GateColors.onPrimary} />
              ) : (
                <>
                  <Text style={styles.addBaleActionIcon}>+</Text>
                  <Text style={styles.addBaleActionText}>Add Bale</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {/* ─── QR Code Sticker & Print Modal ─────────────────────────────────── */}
      <Modal visible={!!activeBaleSticker} animationType="fade" transparent>
        <View style={styles.stickerBackdrop}>
          <View style={styles.stickerCard}>
            <View style={styles.stickerHeader}>
              <Text style={styles.stickerMillName}>MILLTRACK COTTON</Text>
              <TouchableOpacity onPress={() => setActiveBaleSticker(null)} style={styles.stickerCloseBtn}>
                <Text style={styles.stickerClose}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* QR Code Container */}
            <View style={styles.qrWrap}>
              {activeBaleSticker?.qr_payload ? (
                <QRCode
                  value={activeBaleSticker.qr_payload}
                  size={180}
                  color="#000"
                  backgroundColor="#FFF"
                />
              ) : null}
            </View>

            {/* Printed Metadata */}
            <Text style={styles.stickerBaleCode}>{activeBaleSticker?.bale_code}</Text>

            <View style={styles.stickerWeightGrid}>
              <View style={styles.stickerWeightBox}>
                <Text style={styles.stickerWeightLabel}>NET WT</Text>
                <Text style={styles.stickerNetWeight}>
                  {activeBaleSticker?.net_weight_kg} <Text style={{ fontSize: 14 }}>kg</Text>
                </Text>
              </View>

              <View style={styles.stickerWeightBox}>
                <Text style={styles.stickerWeightLabel}>GROSS / TARE</Text>
                <Text style={styles.stickerGrossTare}>
                  {activeBaleSticker?.gross_weight_kg} kg / {activeBaleSticker?.tare_weight_kg} kg
                </Text>
              </View>
            </View>

            <View style={styles.stickerMetaRow}>
              <Text style={styles.stickerMetaText}>Grade: {activeBaleSticker?.quality_grade}</Text>
              <Text style={styles.stickerMetaText}>Vehicle: {vehicle?.vehicle_number}</Text>
            </View>

            {reprint && reprint.baleId === activeBaleSticker?.id && reprint.message ? (
              <Text style={[styles.reprintMsg, reprint.state === 'error' && styles.reprintErr]}>{reprint.message}</Text>
            ) : null}

            {/* Actions */}
            <View style={styles.stickerActions}>
              <TouchableOpacity
                style={styles.stickerPrintBtn}
                disabled={reprint?.state === 'busy'}
                onPress={() => activeBaleSticker && handleReprint(activeBaleSticker)}
              >
                <Text style={styles.stickerPrintText}>
                  {reprint?.state === 'busy' && reprint.baleId === activeBaleSticker?.id ? 'Printing…' : 'Reprint label'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.nextBaleBtn}
                onPress={() => {
                  setActiveBaleSticker(null);
                  setTimeout(() => weightInputRef.current?.focus(), 250);
                }}
              >
                <Text style={styles.nextBaleBtnText}>Next Bale →</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {tareDialog}
      {voidDialog}
      <ConfirmDialog
        visible={finishOpen}
        title={`Finish unloading ${vehicle?.vehicle_number ?? 'this vehicle'}?`}
        message={`${totalBales} ${totalBales === 1 ? 'bale' : 'bales'} · ${totalNetKg.toLocaleString('en-IN', { maximumFractionDigits: 1 })} kg net. The vehicle leaves the unloading queue. The gateman still exits it through the gate.`}
        confirmLabel="Finish"
        loading={isFinishing}
        onConfirm={() => finishUnloading()}
        onCancel={() => setFinishOpen(false)}
      />
      {toastEl}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: GateColors.surface0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: GateRadius.sm,
    backgroundColor: GateColors.surface2,
  },
  backBtnText: {
    color: GateColors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  headerCenter: {
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 8,
    minWidth: 0,
  },
  headerVehicleNumber: {
    fontSize: 17,
    fontWeight: '800',
    color: GateColors.textPrimary,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 12,
    color: GateColors.textSecondary,
    marginTop: 1,
  },
  setupBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: GateRadius.md,
  },
  setupBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: GateColors.primary,
  },
  statsBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GateColors.surface1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
  },
  statBox: {
    flex: 1,
    alignItems: 'center',
    minWidth: 0,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: GateColors.surface4,
  },
  statLabel: {
    fontSize: 10,
    color: GateColors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
    marginTop: 2,
  },
  statBigValue: {
    fontSize: 20,
    fontWeight: '800',
    color: GateColors.textPrimary,
  },
  statSubValue: {
    fontSize: 12,
    color: GateColors.textMuted,
  },
  statBigWeight: {
    fontSize: 17,
    fontWeight: '800',
    color: GateColors.primary,
    marginTop: 2,
  },
  statUnit: {
    fontSize: 12,
    fontWeight: '600',
    color: GateColors.textSecondary,
  },
  statPresetText: {
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.textPrimary,
    marginTop: 2,
  },
  statTareKgSub: {
    fontSize: 10,
    color: GateColors.textMuted,
  },
  statLocationText: {
    fontSize: 10,
    color: GateColors.textMuted,
    marginTop: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  listFlex: {
    flex: 1,
  },
  listContent: {
    padding: 14,
    gap: 10,
    paddingBottom: 24,
    flexGrow: 1,
  },
  baleCard: {
    backgroundColor: GateColors.surface1,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    borderRadius: GateRadius.md,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  baleCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    minWidth: 0,
  },
  baleIndexBadge: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: GateColors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  baleIndexText: {
    fontSize: 13,
    fontWeight: '800',
    color: GateColors.textSecondary,
  },
  baleCardInfo: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  baleCodeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  baleCode: {
    fontSize: 15,
    fontWeight: '800',
    color: GateColors.textPrimary,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  gradeBadge: {
    backgroundColor: GateColors.primaryLight,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  gradeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: GateColors.primary,
  },
  weightDetails: {
    fontSize: 12,
    color: GateColors.textSecondary,
  },
  weightNum: {
    color: GateColors.textPrimary,
    fontWeight: '600',
  },
  baleCardRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  netWeightBig: {
    fontSize: 16,
    fontWeight: '800',
    color: GateColors.success,
  },
  printBtn: {
    backgroundColor: GateColors.surface2,
    borderWidth: 1,
    borderColor: GateColors.surface4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: GateRadius.sm,
  },
  printBtnDone: {
    borderColor: GateColors.success,
    backgroundColor: GateColors.successLight,
  },
  voidText: { fontSize: 11, fontWeight: '600', color: GateColors.danger },
  printBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: GateColors.textSecondary,
  },
  printBtnTextDone: {
    color: GateColors.success,
  },
  bottomBar: {
    backgroundColor: GateColors.surface1,
    borderTopWidth: 2,
    borderTopColor: GateColors.surface4,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 16 : 14,
    gap: 8,
  },
  bottomBarTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  nextBaleLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.primary,
  },
  calcNetPreview: {
    fontSize: 12,
    fontWeight: '700',
    color: GateColors.success,
  },
  tareGuideText: {
    fontSize: 11,
    color: GateColors.textMuted,
  },
  inputAndActionRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  weightInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: GateColors.surface2,
    borderWidth: 2,
    borderColor: GateColors.primary,
    borderRadius: GateRadius.md,
    paddingHorizontal: 14,
    minWidth: 0,
  },
  weightInput: {
    flex: 1,
    height: 48,
    fontSize: 22,
    fontWeight: '800',
    color: GateColors.textPrimary,
    minWidth: 0,
  },
  weightUnitSuffix: {
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.textSecondary,
    flexShrink: 0,
    marginLeft: 6,
  },
  addBaleActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GateColors.primary,
    paddingHorizontal: 16,
    height: 50,
    borderRadius: GateRadius.md,
    justifyContent: 'center',
    flexShrink: 0,
  },
  addBaleActionBtnDisabled: {
    opacity: 0.4,
  },
  addBaleActionIcon: {
    fontSize: 18,
    fontWeight: '900',
    color: GateColors.onPrimary,
  },
  addBaleActionText: {
    fontSize: 15,
    fontWeight: '800',
    color: GateColors.onPrimary,
  },
  centerLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  centerLoadingText: {
    color: GateColors.textSecondary,
    fontSize: 13,
    marginTop: 10,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: GateColors.textPrimary,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: GateColors.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
  },
  stickerBackdrop: {
    flex: 1,
    backgroundColor: GateColors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  stickerCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.xl,
    padding: 20,
    alignItems: 'center',
  },
  stickerHeader: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  stickerMillName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#000000',
    letterSpacing: 1,
  },
  stickerCloseBtn: {
    padding: 4,
  },
  stickerClose: {
    fontSize: 18,
    color: '#666666',
    fontWeight: '700',
  },
  qrWrap: {
    padding: 12,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.md,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    marginBottom: 12,
  },
  stickerBaleCode: {
    fontSize: 22,
    fontWeight: '900',
    color: '#000000',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 1,
    marginBottom: 10,
  },
  stickerWeightGrid: {
    width: '100%',
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  stickerWeightBox: {
    flex: 1,
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.md,
    padding: 10,
    alignItems: 'center',
  },
  stickerWeightLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: GateColors.textMuted,
    marginBottom: 2,
  },
  stickerNetWeight: {
    fontSize: 20,
    fontWeight: '900',
    color: GateColors.success,
  },
  stickerGrossTare: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1F2937',
  },
  stickerMetaRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface3,
    marginBottom: 16,
  },
  stickerMetaText: {
    fontSize: 11,
    color: '#4B5563',
    fontWeight: '600',
  },
  stickerActions: {
    width: '100%',
    gap: 8,
  },
  stickerPrintBtn: {
    width: '100%',
    backgroundColor: '#1E293B',
    paddingVertical: 14,
    borderRadius: GateRadius.md,
    alignItems: 'center',
  },
  stickerPrintText: {
    color: GateColors.onPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  nextBaleBtn: {
    width: '100%',
    backgroundColor: GateColors.primary,
    paddingVertical: 14,
    borderRadius: GateRadius.md,
    alignItems: 'center',
  },
  nextBaleBtnText: {
    color: '#000000',
    fontSize: 15,
    fontWeight: '800',
  },
  labelHint: { fontSize: 11, color: GateColors.textMuted },
  reprintMsg: { fontSize: 13, fontWeight: '600', color: GateColors.success, textAlign: 'center', marginTop: 4 },
  reprintErr: { color: GateColors.danger },
  finishBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: GateColors.surface0,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface3,
  },
  finishText: { fontSize: 13, color: GateColors.textSecondary },
  finishBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: GateRadius.md,
    borderWidth: 1.5,
    borderColor: GateColors.primary,
    backgroundColor: GateColors.surface1,
  },
  finishBtnText: { fontSize: 13, fontWeight: '700', color: GateColors.primary },
});
