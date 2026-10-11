/**
 * Milltrack design tokens — the single source of truth for the whole app
 * (login, gate, godown and admin). Light, neutral slate surfaces with one
 * blue brand colour and semantic status colours.
 */

export const GateColors = {
  // Brand
  primary: '#0369A1',
  primaryDark: '#075985',
  primaryLight: '#E0F2FE', // tinted fill behind primary-coloured content
  onPrimary: '#FFFFFF', // text / icons placed on a primary fill

  // Status
  onPremises: '#15803D',
  onPremisesLight: '#DCFCE7',
  exited: '#475569',
  exitedLight: '#E2E8F0',

  // Unloading / Loading badges
  unloading: '#1D4ED8',
  unloadingLight: '#DBEAFE',
  loading: '#7E22CE',
  loadingLight: '#F3E8FF',

  // Semantic
  success: '#15803D',
  successLight: '#DCFCE7',
  warning: '#B45309',
  warningLight: '#FEF3C7',
  danger: '#DC2626',
  dangerLight: '#FEE2E2',

  // Surfaces
  surface0: '#F8FAFC', // app background
  surface1: '#FFFFFF', // cards
  surface2: '#F1F5F9', // inputs, subtle fills
  surface3: '#E2E8F0', // pressed / secondary buttons
  surface4: '#CBD5E1', // borders and dividers

  // Text
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',

  // Misc
  white: '#FFFFFF',
  overlay: 'rgba(15,23,42,0.55)',
  overlayLight: 'rgba(15,23,42,0.25)',
} as const;

export const GateRadius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const;

export const GateShadow = {
  card: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  fab: {
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
  },
} as const;
