/**
 * HOUSE-ZEN — Realtime connection (transport layer).
 *
 * Production: subscribes one Supabase Realtime channel per authenticated tab,
 * with a `tenant_id=eq.<id>` filter per table. Row Level Security governs what
 * the channel can deliver — a tenant can never receive another tenant's rows
 * even if a tampered client removes the filter.
 *
 * Demo mode: the transport is the in-process bus itself (DemoDataApi emits on
 * every mutation); no network channel is opened. This is the documented mirror
 * of the SQL path, not a silent fallback.
 */

import { config } from '@/lib/config/env';
import { getSupabaseClient, isSupabaseConfigured } from '@/lib/supabase/client';
import type { EntityName } from '@/lib/api/types';
import type { UUID } from '@/types/domain';
import { dataChangeBus, type DataChangeEvent, type RealtimeEventType } from './bus';

/**
 * Tenant-scoped tables pushed to the UI in (near) real time. Kept
 * intentional: high-churn append-only logs (audit_logs, *_logs) are refetched
 * on navigation instead of streamed.
 */
export const REALTIME_TABLES: readonly EntityName[] = [
  'reservations',
  'invoices',
  'payments',
  'notifications',
  'rooms',
  'housekeeping_tasks',
  'maintenance_tickets',
  'service_orders',
  'subscriptions',
];

type PostgresChangesPayload = {
  eventType: RealtimeEventType;
  new: Record<string, unknown> | null;
  old: Record<string, unknown> | null;
};

/**
 * Opens the tenant channel and feeds the bus. Returns a disconnect function.
 * In demo mode this is a no-op (the adapter already emits on the bus).
 */
export function connectTenantRealtime(tenantId: UUID): () => void {
  if (config.demoMode || !isSupabaseConfigured()) {
    return () => undefined;
  }
  const sb = getSupabaseClient();
  const channel = sb.channel(`hz-tenant-${tenantId}`);
  for (const table of REALTIME_TABLES) {
    channel.on(
      'postgres_changes' as never,
      {
        event: '*',
        schema: 'public',
        table,
        filter: `tenant_id=eq.${tenantId}`,
      } as never,
      (payload: PostgresChangesPayload) => {
        const rowId =
          ((payload.new?.id ?? payload.old?.id) as UUID | undefined) ?? null;
        const event: DataChangeEvent = {
          entity: table,
          type: payload.eventType,
          id: rowId,
          tenantId,
        };
        dataChangeBus.emit(event);
      },
    );
  }
  channel.subscribe();
  return () => {
    void sb.removeChannel(channel);
  };
}
