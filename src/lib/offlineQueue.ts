import AsyncStorage from '@react-native-async-storage/async-storage';

import { ASYNC_KEYS } from './constants';
import type { QueuedEntry } from './types';

export async function getQueue(): Promise<QueuedEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(ASYNC_KEYS.OFFLINE_QUEUE);
    if (!raw) return [];
    return JSON.parse(raw) as QueuedEntry[];
  } catch {
    return [];
  }
}

export async function enqueueEntry(entry: QueuedEntry): Promise<void> {
  const queue = await getQueue();
  // Deduplicate by entry id
  const filtered = queue.filter((q) => q.entry.id !== entry.entry.id);
  filtered.push(entry);
  await AsyncStorage.setItem(ASYNC_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
}

export async function removeFromQueue(entryId: string): Promise<void> {
  const queue = await getQueue();
  const filtered = queue.filter((q) => q.entry.id !== entryId);
  await AsyncStorage.setItem(ASYNC_KEYS.OFFLINE_QUEUE, JSON.stringify(filtered));
}

export async function clearQueue(): Promise<void> {
  await AsyncStorage.removeItem(ASYNC_KEYS.OFFLINE_QUEUE);
}
