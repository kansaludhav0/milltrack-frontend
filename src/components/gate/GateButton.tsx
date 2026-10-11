import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  type TouchableOpacityProps,
} from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';

interface ButtonProps extends TouchableOpacityProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function GateButton({
  label,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  style,
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      disabled={isDisabled}
      style={[
        styles.base,
        styles[`size_${size}`],
        styles[`variant_${variant}`],
        isDisabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'primary' ? GateColors.onPrimary : GateColors.primary}
        />
      ) : (
        <Text
          style={[
            styles.label,
            styles[`labelSize_${size}`],
            styles[`labelVariant_${variant}`],
            isDisabled && styles.labelDisabled,
          ]}
        >
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: GateRadius.md,
    gap: 8,
  },
  size_sm: { paddingHorizontal: 12, paddingVertical: 8 },
  size_md: { paddingHorizontal: 20, paddingVertical: 14 },
  size_lg: { paddingHorizontal: 24, paddingVertical: 18 },

  variant_primary: {
    backgroundColor: GateColors.primary,
  },
  variant_secondary: {
    backgroundColor: GateColors.surface3,
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },
  variant_danger: {
    backgroundColor: GateColors.danger,
  },
  variant_ghost: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: GateColors.surface4,
  },

  disabled: { opacity: 0.4 },

  label: { fontWeight: '700', letterSpacing: 0.3 },
  labelSize_sm: { fontSize: 13 },
  labelSize_md: { fontSize: 15 },
  labelSize_lg: { fontSize: 17 },

  labelVariant_primary: { color: GateColors.onPrimary },
  labelVariant_secondary: { color: GateColors.textPrimary },
  labelVariant_danger: { color: GateColors.white },
  labelVariant_ghost: { color: GateColors.textSecondary },

  labelDisabled: { opacity: 0.6 },
});
