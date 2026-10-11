import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

import { GateColors, GateRadius, GateShadow } from '@/constants/gateTheme';
import { GateButton } from './GateButton';

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: 'primary' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  /** Optional third choice shown between Cancel and Confirm. */
  secondaryLabel?: string;
  onSecondary?: () => void;
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
  secondaryLabel,
  onSecondary,
}: ConfirmDialogProps) {
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <TouchableWithoutFeedback onPress={onCancel}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.dialog}>
              <Text style={styles.title}>{title}</Text>
              <Text style={styles.message}>{message}</Text>
              <View style={secondaryLabel ? styles.actionsStacked : styles.actions}>
                {secondaryLabel ? (
                  <GateButton
                    label={confirmLabel}
                    variant={confirmVariant}
                    loading={loading}
                    onPress={onConfirm}
                  />
                ) : null}
                {secondaryLabel ? (
                  <GateButton label={secondaryLabel} variant="secondary" onPress={onSecondary} disabled={loading} />
                ) : null}
                <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={loading}>
                  <Text style={[styles.cancelLabel, secondaryLabel ? styles.cancelCentered : null]}>{cancelLabel}</Text>
                </TouchableOpacity>
                {!secondaryLabel ? (
                  <GateButton
                    label={confirmLabel}
                    variant={confirmVariant}
                    loading={loading}
                    onPress={onConfirm}
                    style={styles.confirmBtn}
                  />
                ) : null}
              </View>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: GateColors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  dialog: {
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.lg,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    gap: 12,
    ...GateShadow.card,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: GateColors.textPrimary,
  },
  message: {
    fontSize: 15,
    color: GateColors.textSecondary,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    justifyContent: 'flex-end',
  },
  actionsStacked: { gap: 8, marginTop: 8 },
  cancelCentered: { textAlign: 'center' },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'center',
  },
  cancelLabel: {
    color: GateColors.textSecondary,
    fontSize: 15,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 1,
    maxWidth: 160,
  },
});
