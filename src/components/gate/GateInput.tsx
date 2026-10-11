import React, { useState } from 'react';
import {
  Animated,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';

interface GateInputProps extends TextInputProps {
  label: string;
  error?: string;
  optional?: boolean;
}

export function GateInput({ label, error, optional, style, ...rest }: GateInputProps) {
  // Use useState so the Animated.Value is stable across renders without being a ref
  const [focusAnim] = useState(() => new Animated.Value(0));

  const borderColor = focusAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [GateColors.surface4, GateColors.primary],
  });

  const onFocus = () =>
    Animated.timing(focusAnim, { toValue: 1, duration: 150, useNativeDriver: false }).start();
  const onBlur = () =>
    Animated.timing(focusAnim, { toValue: 0, duration: 150, useNativeDriver: false }).start();

  return (
    <View style={styles.wrapper}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {optional && <Text style={styles.optional}>optional</Text>}
      </View>
      <Animated.View style={[styles.inputContainer, { borderColor }]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={GateColors.textMuted}
          onFocus={onFocus}
          onBlur={onBlur}
          {...rest}
        />
      </Animated.View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 6 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: GateColors.textSecondary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  optional: {
    fontSize: 11,
    color: GateColors.textMuted,
    fontWeight: '500',
    fontStyle: 'italic',
  },
  inputContainer: {
    backgroundColor: GateColors.surface2,
    borderRadius: GateRadius.md,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  input: {
    fontSize: 16,
    color: GateColors.textPrimary,
    fontWeight: '500',
    margin: 0,
    padding: 0,
  },
  error: {
    fontSize: 12,
    color: GateColors.danger,
    fontWeight: '500',
  },
});
