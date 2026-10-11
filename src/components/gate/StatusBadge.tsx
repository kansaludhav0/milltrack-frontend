import React from 'react';
import { StyleSheet, Text, type TextStyle, View, type ViewStyle } from 'react-native';

import { GateColors, GateRadius } from '@/constants/gateTheme';
import type { Purpose, VehicleStatus } from '@/lib/types';

type BadgeVariant = VehicleStatus | Purpose | 'info';

interface BadgeProps {
  label: string;
  variant: BadgeVariant;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string }> = {
  ON_PREMISES: { bg: GateColors.onPremisesLight, text: GateColors.onPremises },
  EXITED: { bg: GateColors.exitedLight, text: GateColors.exited },
  UNLOADING: { bg: GateColors.unloadingLight, text: GateColors.unloading },
  LOADING: { bg: GateColors.loadingLight, text: GateColors.loading },
  info: { bg: GateColors.primaryLight, text: GateColors.primary },
};

const BADGE_LABELS: Partial<Record<string, string>> = {
  ON_PREMISES: 'On Premises',
  EXITED: 'Exited',
  UNLOADING: 'Unloading',
  LOADING: 'Loading',
};

export function StatusBadge({ label, variant, style, textStyle }: BadgeProps) {
  const colors = BADGE_COLORS[variant] ?? BADGE_COLORS.info;
  const displayLabel = BADGE_LABELS[label] ?? label;

  return (
    <View style={[styles.badge, { backgroundColor: colors.bg }, style]}>
      <Text style={[styles.text, { color: colors.text }, textStyle]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: GateRadius.full,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
