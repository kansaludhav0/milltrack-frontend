import '@/global.css';

import { Platform } from 'react-native';

import { GateColors } from '@/constants/gateTheme';

const palette = {
  text: GateColors.textPrimary,
  background: GateColors.surface0,
  backgroundElement: GateColors.surface2,
  backgroundSelected: GateColors.surface3,
  textSecondary: GateColors.textSecondary,
  cardBackground: GateColors.surface1,
  cardBorder: GateColors.surface3,
  inputBackground: GateColors.surface1,
  inputBorder: GateColors.surface4,
} as const;

// The app ships a single light theme; both schemes resolve to it.
export const Colors = { light: palette, dark: palette } as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'system-ui',
    serif: 'ui-serif',
    rounded: 'ui-rounded',
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
