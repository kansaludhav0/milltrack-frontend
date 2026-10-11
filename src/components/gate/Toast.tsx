import React, { useEffect, useRef } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GateColors, GateRadius } from '@/constants/gateTheme';

interface ToastProps {
  visible: boolean;
  message: string;
  type?: 'error' | 'info' | 'success';
  onDismiss: () => void;
  /** Auto-dismiss delay in ms. Errors stay a little longer. */
  duration?: number;
  /** Where the banner appears. Use 'top' on screens with controls along the bottom. */
  position?: 'top' | 'bottom';
}

const TYPE_COLOR: Record<string, string> = {
  error: GateColors.danger,
  info: GateColors.primary,
  success: GateColors.success,
};

const TYPE_TITLE: Record<string, string> = {
  error: 'Error',
  info: 'Notice',
  success: 'Success',
};

/**
 * Non-blocking banner. Deliberately NOT a Modal: a Modal steals all touches
 * while open and cannot be presented on top of another Modal on iOS, which
 * made errors invisible and left screens unresponsive.
 *
 * Render it as the last child of a screen's root view. Inside a Modal, show
 * errors inline instead (it would be drawn underneath the Modal).
 */
export function Toast({ visible, message, type = 'error', onDismiss, duration, position = 'bottom' }: ToastProps) {
  const insets = useSafeAreaInsets();
  const dismissRef = useRef(onDismiss);
  useEffect(() => {
    dismissRef.current = onDismiss;
  }, [onDismiss]);

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => dismissRef.current(), duration ?? (type === 'error' ? 6000 : 3500));
    return () => clearTimeout(timer);
  }, [visible, message, type, duration]);

  if (!visible) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        position === 'top'
          ? { top: 0, bottom: undefined, paddingTop: insets.top + 8 }
          : { paddingBottom: insets.bottom + 16 },
      ]}
    >
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        style={[styles.toast, { borderLeftColor: TYPE_COLOR[type] }]}
      >
        <View style={styles.body}>
          <Text style={[styles.title, { color: TYPE_COLOR[type] }]}>{TYPE_TITLE[type]}</Text>
          <Text style={styles.message}>{message}</Text>
        </View>
        <Text style={styles.close}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    alignItems: 'center',
    zIndex: 1000,
    elevation: 1000,
  },
  toast: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: GateColors.surface1,
    borderRadius: GateRadius.md,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: GateColors.surface3,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 8,
  },
  body: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 12, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  message: { color: GateColors.textPrimary, fontSize: 14, lineHeight: 20 },
  close: { color: GateColors.textMuted, fontSize: 14, paddingLeft: 4 },
});
