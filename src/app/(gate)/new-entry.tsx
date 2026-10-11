/**
 * New Entry screen — full vehicle entry form with photo upload.
 */
import { useQuery } from '@tanstack/react-query';
import { CameraCapturedPicture, CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import React, { useCallback, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import uuid from 'react-native-uuid';

import { GateButton } from '@/components/gate/GateButton';
import { GateInput } from '@/components/gate/GateInput';
import { SelectField } from '@/components/gate/SelectField';
import { Toast } from '@/components/gate/Toast';
import { GateColors, GateRadius } from '@/constants/gateTheme';
import {
  createEntryApi,
  getLookupsApi,
  presignBillApi,
  presignPhotoApi,
  uploadPhotoToS3,
} from '@/lib/api';
import type { ApiError } from '@/lib/api';
import { useOfflineQueue } from '@/lib/OfflineQueueContext';
import { getGateId } from '@/lib/storage';
import type { EntryIn, Purpose } from '@/lib/types';
import { goBack } from '@/lib/navigation';

type PhotoTarget = 'vehicle' | 'bill';

const CAMERA_GUIDE: Record<PhotoTarget, string> = {
  vehicle: 'Capture vehicle licence plate & front',
  bill: 'Capture the bill / challan — keep it flat and in frame',
};

function PhotoField({
  label,
  required,
  hint,
  uri,
  onCapture,
  testID,
}: {
  label: string;
  required?: boolean;
  hint: string;
  uri: string | null;
  onCapture: () => void;
  testID: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>
        {label}{' '}
        {required ? <Text style={styles.requiredStar}>*</Text> : <Text style={styles.optionalLabel}>(optional)</Text>}
      </Text>
      {uri ? (
        <View style={styles.photoPreviewRow}>
          <Image source={{ uri }} style={styles.photoThumb} contentFit="cover" />
          <View style={styles.photoInfoCol}>
            <View style={styles.photoBadgeRow}>
              <Text style={styles.photoSuccessCheck}>✓</Text>
              <Text style={styles.photoSuccessLabel}>Photo captured</Text>
            </View>
            <TouchableOpacity style={styles.retakePhotoBtn} onPress={onCapture} testID={`retake-${testID}-btn`}>
              <Text style={styles.retakePhotoBtnLabel}>↺ Retake</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity style={styles.cameraCapture} onPress={onCapture} testID={`capture-${testID}-btn`}>
          <Text style={styles.cameraCaptureLabel}>Tap to take photo</Text>
          <Text style={styles.cameraCaptureHint}>{hint}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export default function NewEntryScreen() {
  const { enqueue } = useOfflineQueue();
  const [toast, setToast] = useState<{
    visible: boolean;
    message: string;
    type: 'error' | 'info' | 'success';
  }>({ visible: false, message: '', type: 'error' });

  const showError = (msg: string, type: 'error' | 'info' | 'success' = 'error') =>
    setToast({ visible: true, message: msg, type });

  // ─── Form State ────────────────────────────────────────────────────────────
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [purpose, setPurpose] = useState<Purpose>('UNLOADING');
  const [partyId, setPartyId] = useState<string | null>(null);
  const [driverName, setDriverName] = useState('');
  const [driverMobile, setDriverMobile] = useState('');
  const [materialVarietyId, setMaterialVarietyId] = useState<string | null>(null);
  const [approxBaleCount, setApproxBaleCount] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [billPhotoUri, setBillPhotoUri] = useState<string | null>(null);
  const [captureTarget, setCaptureTarget] = useState<PhotoTarget>('vehicle');

  // ─── In-Screen Camera State ────────────────────────────────────────────────
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CameraCapturedPicture | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const handleOpenCamera = async (target: PhotoTarget) => {
    setCaptureTarget(target);
    if (!cameraPermission?.granted) {
      const res = await requestCameraPermission();
      if (!res.granted) {
        showError('Camera permission is required to capture photos.');
        return;
      }
    }
    setCapturedPhoto(null);
    setIsCameraOpen(true);
  };

  // ─── Lookups ───────────────────────────────────────────────────────────────
  const { data: lookups } = useQuery({
    queryKey: ['lookups'],
    queryFn: getLookupsApi,
    staleTime: 1000 * 60 * 5,
  });


  // ─── Photo Upload + Submit ─────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    // Validate
    if (!vehicleNumber.trim()) {
      showError('Vehicle number is required.');
      return;
    }
    if (!photoUri) {
      showError('A vehicle photo is required.');
      return;
    }

    setIsSubmitting(true);

    try {
      // 1+2. Presign and upload each photo (vehicle + optional bill) in parallel.
      // The bill uses its own presign endpoint; if skipped, no bill_photo_url key is sent.
      const uploadOne = async (uri: string, presign: typeof presignPhotoApi) => {
        const { upload_url, photo_url } = await presign();
        await uploadPhotoToS3(upload_url, uri);
        return photo_url;
      };
      const [photo_url, bill_photo_url] = await Promise.all([
        uploadOne(photoUri, presignPhotoApi),
        billPhotoUri ? uploadOne(billPhotoUri, presignBillApi) : Promise.resolve(undefined),
      ]);

      // 3. Build entry
      const entry: EntryIn = {
        id: uuid.v4() as string,
        vehicle_number: vehicleNumber.trim().toUpperCase(),
        purpose,
        photo_url,
        ...(bill_photo_url && { bill_photo_url }),
        ...(partyId && { party_id: partyId }),
        ...(driverName.trim() && { driver_name: driverName.trim() }),
        ...(driverMobile.trim() && { driver_mobile: driverMobile.trim() }),
        ...(materialVarietyId && { material_variety_id: materialVarietyId }),
        ...(approxBaleCount && purpose === 'UNLOADING' && {
          approx_bale_count: parseInt(approxBaleCount, 10),
        }),
        ...(invoiceNumber.trim() && { invoice_number: invoiceNumber.trim() }),
      };

      // 4. Submit (with offline fallback)
      try {
        const gateId = await getGateId();
        if (!gateId) throw new Error('Gate not paired. Please pair gate first.');
        console.log('[NEW_ENTRY] Submitting entry with gateId:', gateId);
        await createEntryApi(entry, gateId);
        showError('Entry logged successfully!', 'success');
        setTimeout(() => goBack(), 1200);
      } catch (netErr) {
        const e = netErr as ApiError;
        if (e.status) {
          // 4xx — don't queue, show user
          showError(e.message);
        } else {
          // Network error — queue
          await enqueue(entry);
          showError('Offline — entry queued. Will sync on reconnect.', 'info');
          setTimeout(() => goBack(), 1800);
        }
      }
    } catch (err) {
      const e = err as Error;
      showError(e.message ?? 'Failed to submit entry.');
    } finally {
      setIsSubmitting(false);
    }
  }, [
    vehicleNumber,
    photoUri,
    billPhotoUri,
    purpose,
    partyId,
    driverName,
    driverMobile,
    materialVarietyId,
    approxBaleCount,
    invoiceNumber,
    enqueue,
  ]);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => goBack()}
          style={styles.backBtn}
          testID="new-entry-back-btn"
        >
          <Text style={styles.backBtnText}>← Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Log Vehicle Entry</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Vehicle Number (required) */}
          <GateInput
            label="Vehicle Number"
            value={vehicleNumber}
            onChangeText={(t) => setVehicleNumber(t.toUpperCase())}
            placeholder="e.g. PB-10-AB-4521"
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="next"
            testID="vehicle-number-input"
          />

          {/* Purpose segment (required) */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>
              Purpose <Text style={styles.requiredStar}>*</Text>
            </Text>
            <View style={styles.segmentRow}>
              {(['UNLOADING', 'LOADING'] as Purpose[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={[styles.segmentBtn, purpose === p && styles.segmentBtnActive]}
                  onPress={() => setPurpose(p)}
                  activeOpacity={0.7}
                  testID={`purpose-btn-${p}`}
                >
                  <Text style={[styles.segmentLabel, purpose === p && styles.segmentLabelActive]}>
                    {p === 'UNLOADING' ? 'Unloading' : 'Loading'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Photos */}
          <PhotoField
            label="Vehicle photo"
            required
            hint="Required — licence plate & vehicle front"
            uri={photoUri}
            onCapture={() => handleOpenCamera('vehicle')}
            testID="vehicle-photo"
          />
          <PhotoField
            label="Attach bill photo"
            hint="Photograph the bill / invoice the vehicle brings"
            uri={billPhotoUri}
            onCapture={() => handleOpenCamera('bill')}
            testID="bill-photo"
          />

          {/* Party */}
          <SelectField
            label="Party"
            optional
            placeholder="Select party"
            sheetTitle="Select party"
            searchPlaceholder="Search by name or phone"
            emptyText="No parties found"
            options={(lookups?.parties ?? []).map((p) => ({
              id: p.id,
              title: p.name,
              subtitle: p.contact_phone,
            }))}
            value={partyId}
            onChange={setPartyId}
            testID="party-picker-btn"
          />

          {/* Driver info */}
          <GateInput
            label="Driver Name"
            value={driverName}
            onChangeText={setDriverName}
            placeholder="Optional"
            optional
            returnKeyType="next"
            testID="driver-name-input"
          />
          <GateInput
            label="Driver Mobile"
            value={driverMobile}
            onChangeText={setDriverMobile}
            placeholder="+91 00000 00000"
            optional
            keyboardType="phone-pad"
            returnKeyType="next"
            testID="driver-mobile-input"
          />

          {/* Unloading-specific fields */}
          {purpose === 'UNLOADING' && (
            <>
              {/* Material variety */}
              <SelectField
                label="Material Variety"
                optional
                placeholder="Select material variety"
                sheetTitle="Select material variety"
                emptyText="No varieties found"
                options={(lookups?.material_varieties ?? []).map((v) => ({ id: v.id, title: v.name }))}
                value={materialVarietyId}
                onChange={setMaterialVarietyId}
                testID="variety-picker-btn"
              />

              <GateInput
                label="Approx Bale Count"
                value={approxBaleCount}
                onChangeText={setApproxBaleCount}
                placeholder="e.g. 100"
                optional
                keyboardType="number-pad"
                returnKeyType="next"
                testID="bale-count-input"
              />
            </>
          )}

          {/* Invoice number */}
          <GateInput
            label="Invoice / Challan Number"
            value={invoiceNumber}
            onChangeText={setInvoiceNumber}
            placeholder="Optional"
            optional
            returnKeyType="done"
            testID="invoice-input"
          />

          {/* Submit */}
          <GateButton
            label={isSubmitting ? 'Logging Entry…' : 'Log Vehicle Entry'}
            loading={isSubmitting}
            onPress={handleSubmit}
            disabled={isSubmitting}
            style={styles.submitBtn}
            testID="submit-entry-btn"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ─── Integrated Fullscreen Camera Modal ─────────────────────────── */}
      <Modal visible={isCameraOpen} animationType="slide" statusBarTranslucent>
        <SafeAreaView style={styles.cameraContainer}>
          {!cameraPermission?.granted ? (
            <View style={styles.permCenter}>
              <Text style={styles.permTitle}>Camera Access Required</Text>
              <Text style={styles.permSub}>
                MillTrack needs camera permission to photograph vehicles and bills.
              </Text>
              <TouchableOpacity
                style={styles.permBtn}
                onPress={async () => {
                  const res = await requestCameraPermission();
                  if (!res.granted) {
                    showError('Camera permission denied.');
                  }
                }}
              >
                <Text style={styles.permBtnLabel}>Grant Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.cancelLink}
                onPress={() => setIsCameraOpen(false)}
              >
                <Text style={styles.cancelLinkLabel}>Cancel</Text>
              </TouchableOpacity>
            </View>
          ) : capturedPhoto ? (
            /* Review captured photo */
            <View style={styles.cameraPreviewContainer}>
              <Image
                source={{ uri: capturedPhoto.uri }}
                style={styles.fullPreviewImage}
                contentFit="contain"
              />
              <View style={styles.cameraBottomBar}>
                <TouchableOpacity
                  style={styles.cameraRetakeBtn}
                  onPress={() => setCapturedPhoto(null)}
                >
                  <Text style={styles.cameraRetakeBtnText}>↺ Retake</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.cameraAcceptBtn}
                  onPress={() => {
                    if (captureTarget === 'bill') setBillPhotoUri(capturedPhoto.uri);
                    else setPhotoUri(capturedPhoto.uri);
                    setCapturedPhoto(null);
                    setIsCameraOpen(false);
                  }}
                >
                  <Text style={styles.cameraAcceptBtnText}>✓ Use Photo</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            /* Live Camera View */
            <View style={styles.cameraViewWrap}>
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing="back"
                onCameraReady={() => setIsCameraReady(true)}
              />

              {/* Viewfinder Overlay Guide */}
              <View style={styles.cameraOverlay}>
                <View style={styles.cameraHeaderBar}>
                  <TouchableOpacity
                    style={styles.cameraCloseBtn}
                    onPress={() => setIsCameraOpen(false)}
                  >
                    <Text style={styles.cameraCloseIcon}>✕</Text>
                  </TouchableOpacity>
                  <Text style={styles.cameraGuideText}>{CAMERA_GUIDE[captureTarget]}</Text>
                  <View style={{ width: 40 }} />
                </View>

                {/* Viewfinder frame */}
                <View style={styles.viewfinderFrame} />

                {/* Bottom Shutter Controls */}
                <View style={styles.cameraBottomControls}>
                  <TouchableOpacity
                    style={[styles.shutterBtn, isCapturing && styles.shutterBtnCapturing]}
                    disabled={!isCameraReady || isCapturing}
                    onPress={async () => {
                      if (!cameraRef.current || isCapturing) return;
                      setIsCapturing(true);
                      try {
                        const photo = await cameraRef.current.takePictureAsync({
                          quality: 0.85,
                          skipProcessing: false,
                        });
                        if (photo) setCapturedPhoto(photo);
                      } catch (e: any) {
                        showError(e?.message || 'Failed to capture photo.');
                      } finally {
                        setIsCapturing(false);
                      }
                    }}
                  >
                    <View style={styles.shutterInner} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </SafeAreaView>
      </Modal>

      <Toast
        visible={toast.visible}
        message={toast.message}
        type={toast.type}
        onDismiss={() => setToast((t) => ({ ...t, visible: false }))}
      />
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
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: GateColors.surface4,
    backgroundColor: GateColors.surface1,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  backBtnText: {
    color: GateColors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  kav: {
    flex: 1,
  },
  scroll: {
    padding: 16,
    gap: 18,
    paddingBottom: 40,
  },
  fieldGroup: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: GateColors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  requiredStar: {
    color: GateColors.primary,
  },
  optionalLabel: {
    fontSize: 12,
    fontWeight: '400',
    color: GateColors.textMuted,
    textTransform: 'none',
  },
  segmentRow: {
    flexDirection: 'row',
    gap: 10,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.md,
    borderWidth: 1.5,
    borderColor: GateColors.surface4,
  },
  segmentBtnActive: {
    backgroundColor: GateColors.primaryLight,
    borderColor: GateColors.primary,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: GateColors.textSecondary,
  },
  segmentLabelActive: {
    color: GateColors.primary,
    fontWeight: '800',
  },
  cameraCapture: {
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.lg,
    borderWidth: 2,
    borderColor: GateColors.surface4,
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    gap: 8,
  },
  cameraIcon: {
    fontSize: 36,
  },
  cameraCaptureLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  cameraCaptureHint: {
    fontSize: 12,
    color: GateColors.textMuted,
  },
  photoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.lg,
    padding: 12,
    borderWidth: 1.5,
    borderColor: GateColors.success,
  },
  photoThumb: {
    width: 80,
    height: 80,
    borderRadius: GateRadius.md,
    backgroundColor: GateColors.surface3,
  },
  photoInfoCol: {
    flex: 1,
    gap: 8,
  },
  photoBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  photoSuccessCheck: {
    fontSize: 14,
    fontWeight: 'bold',
    color: GateColors.success,
  },
  photoSuccessLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: GateColors.success,
  },
  retakePhotoBtn: {
    backgroundColor: GateColors.surface3,
    borderRadius: GateRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  retakePhotoBtnLabel: {
    color: GateColors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  submitBtn: {
    marginTop: 10,
  },

  // ─── Camera Modal Styles ───────────────────────────────────────────────────
  cameraContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  cameraViewWrap: {
    flex: 1,
    position: 'relative',
  },
  cameraOverlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
    padding: 20,
  },
  cameraHeaderBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
  },
  cameraCloseBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cameraCloseIcon: {
    fontSize: 20,
    color: '#FFF',
    fontWeight: 'bold',
  },
  cameraGuideText: {
    fontSize: 13,
    color: '#FFF',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: GateRadius.full,
    fontWeight: '600',
  },
  viewfinderFrame: {
    alignSelf: 'center',
    width: '90%',
    height: '45%',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    borderRadius: GateRadius.lg,
    borderStyle: 'dashed',
  },
  cameraBottomControls: {
    alignItems: 'center',
    paddingBottom: 20,
  },
  shutterBtn: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  shutterBtnCapturing: {
    opacity: 0.5,
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  cameraPreviewContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: '#000',
  },
  fullPreviewImage: {
    flex: 1,
  },
  cameraBottomBar: {
    flexDirection: 'row',
    gap: 16,
    padding: 20,
    backgroundColor: GateColors.surface1,
    borderTopWidth: 1,
    borderTopColor: GateColors.surface4,
  },
  cameraRetakeBtn: {
    flex: 1,
    backgroundColor: GateColors.surface3,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: GateRadius.md,
  },
  cameraRetakeBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: GateColors.textSecondary,
  },
  cameraAcceptBtn: {
    flex: 1.5,
    backgroundColor: GateColors.primary,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: GateRadius.md,
  },
  cameraAcceptBtnText: {
    fontSize: 15,
    fontWeight: '800',
    color: GateColors.onPrimary,
  },
  permCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: GateColors.surface0,
  },
  permIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  permTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: GateColors.textPrimary,
    marginBottom: 8,
  },
  permSub: {
    fontSize: 14,
    color: GateColors.textSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  permBtn: {
    backgroundColor: GateColors.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: GateRadius.md,
    marginBottom: 12,
  },
  permBtnLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: GateColors.onPrimary,
  },
  cancelLink: {
    padding: 8,
  },
  cancelLinkLabel: {
    color: GateColors.textSecondary,
    fontSize: 14,
  },
});
