// Base URL of the FastAPI backend
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://13.126.187.13:8000';

// SecureStore keys
export const SECURE_KEYS = {
  ACCESS_TOKEN: 'milltrack_access_token',
  GATE_ID: 'milltrack_gate_id',
  FULL_NAME: 'milltrack_full_name',
  ROLE: 'milltrack_role',
} as const;

// AsyncStorage keys
export const ASYNC_KEYS = {
  OFFLINE_QUEUE: 'milltrack_offline_queue',
  LAST_UNLOAD_SETUP: 'milltrack_last_unload_setup',
  UNLOAD_SETUP_PREFIX: 'milltrack_unload_setup:',
} as const;
