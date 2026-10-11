import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { SECURE_KEYS } from './constants';

// In-memory fallback in case localStorage is disabled or throws in private browsing
const memoryStore = new Map<string, string>();

async function getSecureItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // localStorage may fail in restricted/private modes
    }
    return memoryStore.get(key) ?? null;
  }
  return SecureStore.getItemAsync(key);
}

async function setSecureItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // localStorage may fail in restricted/private modes
    }
    memoryStore.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function deleteSecureItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // ignore
    }
    memoryStore.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

// ─── Token ───────────────────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return getSecureItem(SECURE_KEYS.ACCESS_TOKEN);
}

export async function setToken(token: string): Promise<void> {
  await setSecureItem(SECURE_KEYS.ACCESS_TOKEN, token);
}

export async function clearToken(): Promise<void> {
  await deleteSecureItem(SECURE_KEYS.ACCESS_TOKEN);
}

// ─── Gate ID ─────────────────────────────────────────────────────────────────

export async function getGateId(): Promise<string | null> {
  return getSecureItem(SECURE_KEYS.GATE_ID);
}

export async function setGateId(gateId: string): Promise<void> {
  await setSecureItem(SECURE_KEYS.GATE_ID, gateId);
}

// ─── Full Name ───────────────────────────────────────────────────────────────

export async function getFullName(): Promise<string | null> {
  return getSecureItem(SECURE_KEYS.FULL_NAME);
}

export async function setFullName(name: string): Promise<void> {
  await setSecureItem(SECURE_KEYS.FULL_NAME, name);
}

export async function clearFullName(): Promise<void> {
  await deleteSecureItem(SECURE_KEYS.FULL_NAME);
}

// ─── Role ────────────────────────────────────────────────────────────────────

export async function getRole(): Promise<string | null> {
  return getSecureItem(SECURE_KEYS.ROLE);
}

export async function setRole(role: string): Promise<void> {
  await setSecureItem(SECURE_KEYS.ROLE, role);
}

export async function clearRole(): Promise<void> {
  await deleteSecureItem(SECURE_KEYS.ROLE);
}

// ─── Logout (clear token + full name + role, but NOT gate_id) ────────────────

export async function clearSession(): Promise<void> {
  await Promise.all([clearToken(), clearFullName(), clearRole()]);
}
