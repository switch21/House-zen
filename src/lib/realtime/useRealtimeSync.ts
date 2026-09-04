/**
 * HOUSE-ZEN — React binding for the realtime bus.
 * Mount once per authenticated layout: opens the tenant channel and
 * invalidates TanStack Query caches as server events arrive, so every open
 * screen converges to the same truth without manual refresh.
 */

import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { UUID } from '@/types/domain';
import { dataChangeBus } from './bus';
import { connectTenantRealtime } from './connect';
import { queryKeysForEvent } from './keys';

export function useRealtimeSync(tenantId: UUID | null | undefined): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId) return undefined;
    const disconnect = connectTenantRealtime(tenantId);
    const unsubscribe = dataChangeBus.subscribe((event) => {
      for (const key of queryKeysForEvent(event)) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
    });
    return () => {
      unsubscribe();
      disconnect();
    };
  }, [tenantId, queryClient]);
}
