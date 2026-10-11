import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';

import { createEntryApi } from '@/lib/api';
import { enqueueEntry, getQueue, removeFromQueue } from '@/lib/offlineQueue';
import { getGateId } from '@/lib/storage';
import type { EntryIn, QueuedEntry } from '@/lib/types';

interface OfflineQueueContextValue {
  pendingCount: number;
  enqueue: (entry: EntryIn) => Promise<void>;
  flushQueue: () => Promise<void>;
}

const OfflineQueueContext = createContext<OfflineQueueContextValue | null>(null);

export function OfflineQueueProvider({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async () => {
    const q = await getQueue();
    setPendingCount(q.length);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const enqueue = useCallback(
    async (entry: EntryIn) => {
      const queued: QueuedEntry = { entry, queuedAt: new Date().toISOString() };
      await enqueueEntry(queued);
      await refresh();
    },
    [refresh]
  );

  const flushQueue = useCallback(async () => {
    const queue = await getQueue();
    if (queue.length === 0) return;

    const gateId = await getGateId();
    if (!gateId) return;

    for (const item of queue) {
      try {
        await createEntryApi(item.entry, gateId);
        await removeFromQueue(item.entry.id);
      } catch {
        // Leave it in queue for next retry
      }
    }
    await refresh();
  }, [refresh]);

  return (
    <OfflineQueueContext.Provider value={{ pendingCount, enqueue, flushQueue }}>
      {children}
    </OfflineQueueContext.Provider>
  );
}

export function useOfflineQueue(): OfflineQueueContextValue {
  const ctx = useContext(OfflineQueueContext);
  if (!ctx) throw new Error('useOfflineQueue must be used within OfflineQueueProvider');
  return ctx;
}
