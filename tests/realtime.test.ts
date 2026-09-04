/**
 * HOUSE-ZEN — Realtime layer tests (spec Realtime multi-tenant).
 * 1) The data-change bus: subscription lifecycle + consumer error isolation.
 * 2) The invalidation mapping: entity → TanStack Query keys.
 * 3) The demo adapter emits the same events the SQL path delivers through
 *    Supabase Realtime postgres_changes (INSERT/UPDATE/DELETE, tenant-scoped).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed } from '@/lib/demo/store';
import { dataChangeBus, type DataChangeEvent } from '@/lib/realtime/bus';
import { queryKeysForEvent } from '@/lib/realtime/keys';

function collect(): { events: DataChangeEvent[]; unsubscribe: () => void } {
  const events: DataChangeEvent[] = [];
  const unsubscribe = dataChangeBus.subscribe((e) => events.push(e));
  return { events, unsubscribe };
}

describe('data-change bus', () => {
  beforeEach(() => dataChangeBus.clear());
  afterEach(() => dataChangeBus.clear());

  it('delivers events to every subscriber', () => {
    const a = collect();
    const b = collect();
    dataChangeBus.emit({ entity: 'reservations', type: 'INSERT', id: 'r1', tenantId: 't1' });
    expect(a.events).toHaveLength(1);
    expect(b.events).toHaveLength(1);
    expect(b.events[0]).toMatchObject({ entity: 'reservations', type: 'INSERT', id: 'r1' });
    a.unsubscribe();
    b.unsubscribe();
  });

  it('stops delivering after unsubscribe', () => {
    const { events, unsubscribe } = collect();
    unsubscribe();
    dataChangeBus.emit({ entity: 'rooms', type: 'UPDATE', id: 'room-1', tenantId: 't1' });
    expect(events).toHaveLength(0);
  });

  it('isolates a broken consumer from others (SQL NOTIFY analog)', () => {
    const broken = dataChangeBus.subscribe(() => {
      throw new Error('consumer bug');
    });
    const { events, unsubscribe } = collect();
    dataChangeBus.emit({ entity: 'invoices', type: 'UPDATE', id: 'i1', tenantId: 't1' });
    expect(events).toHaveLength(1);
    broken();
    unsubscribe();
  });
});

describe('query invalidation mapping', () => {
  it('reservations refresh list + KPIs + calendar', () => {
    const keys = queryKeysForEvent({ entity: 'reservations', type: 'INSERT', id: 'r1', tenantId: 't1' });
    expect(keys).toContainEqual(['hz', 'reservations']);
    expect(keys).toContainEqual(['hz', 'kpis']);
    expect(keys).toContainEqual(['hz', 'calendar']);
  });

  it('invoices refresh list + KPIs, not calendar', () => {
    const keys = queryKeysForEvent({ entity: 'invoices', type: 'UPDATE', id: 'i1', tenantId: 't1' });
    expect(keys).toContainEqual(['hz', 'invoices']);
    expect(keys).toContainEqual(['hz', 'kpis']);
    expect(keys).not.toContainEqual(['hz', 'calendar']);
  });

  it('subscription changes refresh the subscription cache', () => {
    const keys = queryKeysForEvent({ entity: 'subscriptions', type: 'UPDATE', id: 's1', tenantId: 't1' });
    expect(keys).toContainEqual(['hz', 'subscription']);
  });

  it('low-churn entities only refresh their own list', () => {
    const keys = queryKeysForEvent({ entity: 'suppliers', type: 'INSERT', id: 's1', tenantId: 't1' });
    expect(keys).toEqual([['hz', 'suppliers']]);
  });
});

describe('demo adapter emits realtime events (mirror of SQL path)', () => {
  let api: DemoDataApi;
  let sub: { events: DataChangeEvent[]; unsubscribe: () => void };

  beforeEach(() => {
    dataChangeBus.clear();
    api = new DemoDataApi(buildSeed());
    sub = collect();
  });
  afterEach(() => {
    sub.unsubscribe();
    dataChangeBus.clear();
  });

  it('emits INSERT/UPDATE/DELETE on generic CRUD, tenant-scoped', async () => {
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const created = await api.create('customers', {
      full_name: 'Test Realtime', email: 'rt@test.x', phone: '+237600000000',
    });
    const updated = await api.update('customers', created.id, { notes: 'vip' });
    await api.remove('customers', updated.id);
    const types = sub.events.filter((e) => e.entity === 'customers').map((e) => e.type);
    expect(types).toEqual(['INSERT', 'UPDATE', 'DELETE']);
    expect(sub.events.every((e) => e.tenantId !== null)).toBe(true);
  });

  it('emits reservations INSERT on atomic creation', async () => {
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const props = await api.list('properties');
    const rts = await api.searchAvailableRoomTypes(
      props.items[0]!.id, '2026-12-01', '2026-12-03', 2,
    );
    const rt = rts[0]!;
    const rooms = await api.list('rooms', { filters: { room_type_id: rt.room_type_id } });
    const custs = await api.list('customers');
    await api.createReservationAtomic({
      property_id: props.items[0]!.id,
      customer_id: custs.items[0]!.id,
      room_id: rooms.items[0]!.id,
      room_type_id: rt.room_type_id,
      check_in_date: '2026-12-01',
      check_out_date: '2026-12-03',
      adults: 2,
      children: 0,
      source: 'WALK_IN',
    });
    const insert = sub.events.find((e) => e.entity === 'reservations' && e.type === 'INSERT');
    expect(insert).toBeDefined();
    expect(insert?.tenantId).toBe('t-zen-0001');
  });

  it('emits payments INSERT + invoices UPDATE when a payment lands', async () => {
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const invoices = await api.list('invoices');
    const target = invoices.items.find((i) => i.status === 'ISSUED');
    expect(target).toBeDefined();
    await api.recordPayment({
      invoice_id: target!.id, reservation_id: null,
      amount: 5000, method: 'CASH', idempotency_key: `rt-${Date.now()}`,
    });
    expect(sub.events).toContainEqual(
      expect.objectContaining({ entity: 'payments', type: 'INSERT' }),
    );
    expect(sub.events).toContainEqual(
      expect.objectContaining({ entity: 'invoices', type: 'UPDATE', id: target!.id }),
    );
  });

  it('emits notifications UPDATE when marked read (live badge sync)', async () => {
    await api.signIn('owner@demo.house-zen.app', 'demo1234');
    const notifs = await api.listMyNotifications();
    const unread = notifs.find((n) => n.read_at === null);
    if (!unread) return; // seed may have all read — nothing to assert
    await api.markNotificationRead(unread.id);
    expect(sub.events).toContainEqual(
      expect.objectContaining({ entity: 'notifications', type: 'UPDATE', id: unread.id }),
    );
  });

  it('emits rooms UPDATE on housekeeping transition', async () => {
    await api.signIn('menage@demo.house-zen.app', 'demo1234');
    const rooms = await api.list('rooms', { filters: { housekeeping_state: 'DIRTY' } });
    const room = rooms.items[0];
    expect(room).toBeDefined();
    await api.setRoomHousekeepingState(room!.id, 'CLEANING');
    expect(sub.events).toContainEqual(
      expect.objectContaining({ entity: 'rooms', type: 'UPDATE', id: room!.id }),
    );
  });
});
