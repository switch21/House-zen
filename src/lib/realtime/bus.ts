/**
 * HOUSE-ZEN — Realtime data-change bus.
 *
 * A single, framework-agnostic event bus fed by two sources:
 *  - Production: Supabase Realtime `postgres_changes` channels (RLS-scoped,
 *    see connect.ts) → dataChangeBus.emit(...)
 *  - Demo mode: DemoDataApi emits after each mutation (documented mirror of
 *    the SQL NOTIFY/Realtime path — same semantics, no network).
 *
 * Consumers (React) subscribe via useRealtimeSync() to invalidate TanStack
 * Query caches. The bus never touches the DOM and stays testable in Node.
 */

import type { EntityName } from '@/lib/api/types';
import type { UUID } from '@/types/domain';

export type RealtimeEventType = 'INSERT' | 'UPDATE' | 'DELETE';

export interface DataChangeEvent {
  entity: EntityName;
  type: RealtimeEventType;
  id: UUID | null;
  tenantId: UUID | null;
}

export type DataChangeListener = (event: DataChangeEvent) => void;

class DataChangeBus {
  private listeners = new Set<DataChangeListener>();

  subscribe(listener: DataChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(event: DataChangeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        /* a broken consumer must never break the producer (SQL NOTIFY analog) */
      }
    }
  }

  /** Test seam. */
  listenerCount(): number {
    return this.listeners.size;
  }

  /** Test seam: drop all listeners. */
  clear(): void {
    this.listeners.clear();
  }
}

/** Module-level singleton — one bus per browser tab, like one Supabase socket. */
export const dataChangeBus = new DataChangeBus();
