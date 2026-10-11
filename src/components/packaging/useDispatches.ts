import { useQueries } from '@tanstack/react-query';

import { getDispatchesApi } from '@/lib/api';
import { addDays, toISODate } from '@/lib/dates';
import type { DispatchEntryOut } from '@/lib/types';

/**
 * Open dispatches by vehicle (gate entry id). Looks at today and yesterday, so a
 * vehicle loaded overnight still resumes. The server is the source of truth.
 */
export function useDispatchesByEntry() {
  const today = toISODate(new Date());
  const results = useQueries({
    queries: [today, addDays(today, -1)].map((d) => ({
      queryKey: ['pkg-dispatches', d],
      queryFn: () => getDispatchesApi(d),
    })),
  });
  const map = new Map<string, DispatchEntryOut>();
  results.forEach((r) => (Array.isArray(r.data) ? r.data : []).forEach((d) => map.set(d.gate_entry_id, d)));
  return { byEntry: map, isLoading: results.some((r) => r.isLoading) };
}
