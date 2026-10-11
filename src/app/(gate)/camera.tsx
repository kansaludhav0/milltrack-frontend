/**
 * Camera capture screen — live capture only, no gallery access.
 * Returns the captured photo URI via router params / callback pattern.
 * Called from new-entry before submission.
 */
import {
  CameraView,
  type CameraCapturedPicture,
  useCameraPermissions,
} from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';
import { goBack } from '@/lib/navigation';

// Callback registry — lets camera pass the URI back without navigation params
type CameraCallback = (uri: string) => void;
const callbackRegistry = new Map<string, CameraCallback>();

export function registerCameraCallback(id: string, cb: CameraCallback): void {
  callbackRegistry.set(id, cb);
}

export function unregisterCameraCallback(id: string): void {
  callbackRegistry.delete(id);
}

export default function CameraScreen() {
  const { callbackId } = useLocalSearchParams<{ callbackId: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [isCameraReady, setIsCameraReady] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CameraCapturedPicture | null>(null);

  const handleCapture = useCallback(async () => {
    if (!cameraRef.current || !isCameraReady || isCapturing) return;
    setIsCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      setCapturedPhoto(photo ?? null);
    } catch (e) {
      console.error('Capture failed:', e);
    } finally {
      setIsCapturing(false);
    }
  }, [isCameraReady, isCapturing]);

  const handleAccept = useCallback(() => {
    if (!capturedPhoto) return;
    const cb = callbackRegistry.get(callbackId ?? '');
    if (cb) cb(capturedPhoto.uri);
    goBack();
  }, [capturedPhoto, callbackId]);

  const handleRetake = useCallback(() => {
    setCapturedPhoto(null);
  }, []);

  const handleCancel = useCallback(() => {
    goBack();
  }, []);

  // ─── Permission not yet determined ───────────────────────────────────────

  if (!permission) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={GateColors.primary} />
      </View>
    );
  }

  // ─── Permission denied ────────────────────────────────────────────────────

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <View style={styles.permCard}>
          <Text style={styles.permTitle}>Camera Access Required</Text>
          <Text style={styles.permSub}>
            MillTrack needs camera access to capture vehicle photos for gate log entries.
          </Text>
          <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
            <Text style={styles.permBtnLabel}>Grant Permission</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelLink} onPress={handleCancel}>
            <Text style={styles.cancelLinkLabel}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ─── Preview captured photo ───────────────────────────────────────────────

  if (capturedPhoto) {
    return (
      <View style={styles.previewContainer}>
        {/* We use a CameraView inactive hack — just show photo URI as Image */}
        <View style={[styles.camera, { backgroundColor: '#000' }]}>
          {/* eslint-disable-next-line @typescript-eslint/no-var-requires */}
          <React.Fragment>
            {/* Native Image for preview */}
            {/* expo-image can display file:// URIs */}
            {(() => {
              const { Image } = require('expo-image');
              return (
                <Image
                  source={{ uri: capturedPhoto.uri }}
                  style={StyleSheet.absoluteFill}
                  contentFit="cover"
                />
              );
            })()}
          </React.Fragment>
        </View>

        <View style={styles.overlay}>
          {/* Preview label */}
          <View style={styles.topBar}>
            <Text style={styles.previewLabel}>Review Photo</Text>
          </View>

          {/* Actions */}
          <View style={styles.previewActions}>
            <TouchableOpacity style={styles.retakeBtn} onPress={handleRetake}>
              <Text style={styles.retakeIcon}>↺</Text>
              <Text style={styles.retakeBtnLabel}>Retake</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.acceptBtn} onPress={handleAccept}>
              <Text style={styles.acceptIcon}>✓</Text>
              <Text style={styles.acceptBtnLabel}>Use Photo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ─── Live camera viewfinder ───────────────────────────────────────────────

  return (
    <View style={styles.cameraContainer}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing="back"
        mode="picture"
        onCameraReady={() => setIsCameraReady(true)}
        onMountError={(e) => console.error('Camera mount error:', e)}
      />

      <View style={styles.overlay}>
        {/* Top bar */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleCancel} style={styles.cancelBtn} testID="camera-cancel">
            <Text style={styles.cancelBtnLabel}>✕  Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.cameraLabel}>Vehicle Photo</Text>
          <View style={{ width: 80 }} />
        </View>

        {/* Shutter */}
        <View style={styles.shutterArea}>
          {!isCameraReady && (
            <ActivityIndicator color={GateColors.primary} style={{ marginBottom: 20 }} />
          )}
          <TouchableOpacity
            style={[styles.shutterBtn, (!isCameraReady || isCapturing) && styles.shutterDisabled]}
            onPress={handleCapture}
            disabled={!isCameraReady || isCapturing}
            testID="camera-shutter"
            activeOpacity={0.8}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
          <Text style={styles.shutterHint}>Tap to capture</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  previewContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },

  overlay: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cameraLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  previewLabel: { fontSize: 16, fontWeight: '700', color: '#fff' },
  cancelBtn: { padding: 8 },
  cancelBtnLabel: { color: '#fff', fontSize: 15, fontWeight: '600' },

  shutterArea: {
    alignItems: 'center',
    paddingBottom: 60,
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingTop: 20,
  },
  shutterBtn: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterDisabled: { opacity: 0.4 },
  shutterInner: {
    width: 62,
    height: 62,
    borderRadius: 31,
    backgroundColor: '#fff',
  },
  shutterHint: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500' },

  // Preview actions
  previewActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: 60,
    paddingTop: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    gap: 16,
  },
  retakeBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: GateRadius.md,
    paddingVertical: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  retakeIcon: { fontSize: 22, color: '#fff' },
  retakeBtnLabel: { color: '#fff', fontWeight: '700', fontSize: 14 },
  acceptBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GateColors.primary,
    borderRadius: GateRadius.md,
    paddingVertical: 14,
    gap: 6,
  },
  acceptIcon: { fontSize: 22, color: GateColors.onPrimary },
  acceptBtnLabel: { color: GateColors.onPrimary, fontWeight: '800', fontSize: 14 },

  // Permission card
  permCard: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.xl,
    padding: 28,
    alignItems: 'center',
    gap: 14,
    maxWidth: 340,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  permIcon: { fontSize: 40 },
  permTitle: { fontSize: 20, fontWeight: '800', color: GateColors.textPrimary, textAlign: 'center' },
  permSub: { fontSize: 14, color: GateColors.textSecondary, textAlign: 'center', lineHeight: 20 },
  permBtn: {
    backgroundColor: GateColors.primary,
    borderRadius: GateRadius.md,
    paddingHorizontal: 24,
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  permBtnLabel: { color: GateColors.onPrimary, fontWeight: '800', fontSize: 16 },
  cancelLink: { padding: 8 },
  cancelLinkLabel: { color: GateColors.textSecondary, fontSize: 14, fontWeight: '600' },
});
