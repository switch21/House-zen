/**
 * HOUSE-ZEN — Realtime → Query invalidation mapping (pure, unit-tested).
 *
 * Maps a data-change event to the TanStack Query keys that must be refreshed.
 * Key conventions used across features:
 *   ['hz', entity]            — generic list caches (list/get CRUD pages)
 *   ['hz', 'kpis', tenantId]  — dashboard aggregates
 *   ['hz', 'subscription']    — plan usage
 *   ['public', ...]           — anonymous booking pages (no invalidation needed:
 *                               each visit refetches)
 */

import type { DataChangeEvent } from './bus';

/** Entities whose changes affect the dashboard KPI aggregation. */
const KPI_ENTITIES: ReadonlySet<string> = new Set([
  'reservations', 'reservation_items', 'rooms', 'invoices', 'payments', 'expenses',
  'housekeeping_tasks', 'maintenance_tickets', 'checkins', 'checkouts',
]);

/** Entities whose changes affect the planning calendar. */
const CALENDAR_ENTITIES: ReadonlySet<string> = new Set([
  'reservations', 'reservation_items', 'rooms', 'room_types',
]);

/** Returns the query keys (by prefix) invalidated for this event. */
export function queryKeysForEvent(event: DataChangeEvent): string[][] {
  const keys: string[][] = [['hz', event.entity]];
  if (KPI_ENTITIES.has(event.entity)) keys.push(['hz', 'kpis']);
  if (CALENDAR_ENTITIES.has(event.entity)) keys.push(['hz', 'calendar']);
  if (event.entity === 'subscriptions') keys.push(['hz', 'subscription']);
  if (event.entity === 'memberships') keys.push(['hz', 'memberships']);
  return keys;
}
