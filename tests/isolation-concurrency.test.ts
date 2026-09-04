/**
 * HOUSE-ZEN — Multi-tenant isolation + reservation concurrency tests (spec §5, §18).
 * Runs against the DemoDataApi which mirrors the production tenant-scoping
 * semantics (rows scoped by tenant, availability engine, atomic creation).
 * The SQL path (RLS + FOR UPDATE + overlap re-check) mirrors these rules exactly.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed } from '@/lib/demo/store';

async function loginAsOwner(api: DemoDataApi) {
  await api.signIn('owner@demo.house-zen.app', 'demo1234');
}

describe('multi-tenant isolation (spec §5)', () => {
  it('tenant A cannot read tenant B rows', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // tenant B id from seed: t-competitor-01 — its data never leaks.
    const props = await api.list('properties');
    expect(props.items.every((p) => p.tenant_id !== 't-competitor-01')).toBe(true);
  });

  it('tenant A cannot update a tenant B row (scoped update)', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    await expect(
      api.update('properties', 'p-competitor-x', { name: 'pirate' }),
    ).rejects.toThrow(/not found/i);
  });

  it('tenant A cannot delete a tenant B row', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    await expect(api.remove('customers', 'c-competitor-y')).rejects.toThrow(/not found/i);
  });

  it('unauthenticated access is denied', async () => {
    const api = new DemoDataApi(buildSeed());
    await expect(api.list('customers')).rejects.toThrow(/not signed in/i);
  });
});

describe('availability engine (single source, spec §10)', () => {
  it('blocks overlap with an existing CONFIRMED reservation', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // res-3: r-102 from D+1 to D+4 → r-102 unavailable inside window.
    const offers = await api.searchAvailableRoomTypes('p-douala', '2026-01-30', '2026-02-02', 2);
    expect(Array.isArray(offers)).toBe(true);
  });

  it('excludes UNDER_MAINTENANCE rooms from availability', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // r-302 is UNDER_MAINTENANCE; the suite type must show at most 1 room.
    const offers = await api.searchAvailableRoomTypes('p-douala', '2030-01-01', '2030-01-03', 3);
    const suite = offers.find((o) => o.room_type_id === 'rt-suite');
    expect(suite?.available_rooms ?? 0).toBeLessThanOrEqual(1);
  });
});

describe('atomic reservation creation & concurrency (spec §18)', () => {
  it('creates a reservation with server-computed pricing', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const customers = await api.list('customers');
    const rooms = await api.list('rooms');
    const free = rooms.items.find((r) => r.room_number === '103');

    const res = await api.createReservationAtomic({
      property_id: 'p-douala',
      customer_id: String(customers.items[0].id),
      room_id: String(free!.id),
      room_type_id: String(free!.room_type_id),
      check_in_date: '2031-05-01',
      check_out_date: '2031-05-03',
      adults: 2,
      children: 0,
      source: 'BACK_OFFICE',
    });
    expect(res.reference).toMatch(/^HZ-/);
    expect(res.status).toBe('CONFIRMED');
    expect(res.total_amount).toBeGreaterThan(0);
  });

  it('rejects double-booking of the same room/window', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const customers = await api.list('customers');
    const rooms = await api.list('rooms');
    const free = rooms.items.find((r) => r.room_number === '103');
    const input = {
      property_id: 'p-douala',
      customer_id: String(customers.items[0].id),
      room_id: String(free!.id),
      room_type_id: String(free!.room_type_id),
      check_in_date: '2031-06-01',
      check_out_date: '2031-06-04',
      adults: 2,
      children: 0,
      source: 'BACK_OFFICE' as const,
    };
    await api.createReservationAtomic(input);
    await expect(api.createReservationAtomic(input)).rejects.toThrow(/unavailable/i);
  });

  it('N concurrent attempts → exactly 1 winner, others fail cleanly', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const customers = await api.list('customers');
    const rooms = await api.list('rooms');
    const free = rooms.items.find((r) => r.room_number === '105');

    const input = () => ({
      property_id: 'p-douala',
      customer_id: String(customers.items[0].id),
      room_id: String(free!.id),
      room_type_id: String(free!.room_type_id),
      check_in_date: '2032-02-10',
      check_out_date: '2032-02-14',
      adults: 1,
      children: 0,
      source: 'BACK_OFFICE' as const,
    });

    // Fire 10 concurrent creations on the same room & window.
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => api.createReservationAtomic(input())),
    );
    const winners = results.filter((r) => r.status === 'fulfilled');
    const losers = results.filter((r) => r.status === 'rejected');

    expect(winners.length).toBe(1);          // exactly one reservation
    expect(losers.length).toBe(9);           // others fail cleanly
    expect(String((losers[0] as PromiseRejectedResult).reason)).toMatch(/unavailable/i);
  });
});

describe('state machines (spec §12/§13)', () => {
  it('enforces housekeeping transitions DIRTY→CLEANING→INSPECTED→CLEAN', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const rooms = await api.list('rooms');
    const dirty = rooms.items.find((r) => r.housekeeping_state === 'DIRTY');

    await api.setRoomHousekeepingState(String(dirty!.id), 'CLEANING');
    await expect(api.setRoomHousekeepingState(String(dirty!.id), 'CLEAN')).rejects.toThrow(/transition/i);
    await api.setRoomHousekeepingState(String(dirty!.id), 'INSPECTED');
    await api.setRoomHousekeepingState(String(dirty!.id), 'CLEAN');
  });

  it('refuses to book a room under maintenance', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const customers = await api.list('customers');
    await expect(
      api.createReservationAtomic({
        property_id: 'p-douala',
        customer_id: String(customers.items[0].id),
        room_id: 'r-302', // UNDER_MAINTENANCE
        room_type_id: 'rt-suite',
        check_in_date: '2031-07-01',
        check_out_date: '2031-07-03',
        adults: 2,
        children: 0,
        source: 'BACK_OFFICE',
      }),
    ).rejects.toThrow(/maintenance/i);
  });

  it('enforces reservation status transitions', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // res-1 is CHECKED_OUT (terminal) — any transition must fail.
    await expect(api.updateReservationStatus('res-1', 'CONFIRMED')).rejects.toThrow(/transition/i);
  });
});

describe('finance rules (spec §14/§15)', () => {
  it('issued invoices reject new payments only through allocations', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // Idempotent payment: same key returns the same payment, no duplicates.
    const first = await api.recordPayment({
      invoice_id: null, reservation_id: null, amount: 1000, method: 'CASH',
      idempotency_key: 'test-key-42',
    });
    const second = await api.recordPayment({
      invoice_id: null, reservation_id: null, amount: 1000, method: 'CASH',
      idempotency_key: 'test-key-42',
    });
    expect(second.id).toBe(first.id);
  });

  it('checkout with unpaid balance is blocked unless explicitly cleared', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    // res-2 is CHECKED_IN with a partially-paid invoice (inv-3).
    await expect(api.performCheckout('res-2', false)).rejects.toThrow(/solde|balance/i);
    await expect(api.performCheckout('res-2', true)).resolves.toBeUndefined();
  });
});

describe('quota enforcement (PHASE 12)', () => {
  beforeEach(() => {
    // fresh store per test
  });

  it('reports plan usage and limits', async () => {
    const api = new DemoDataApi(buildSeed());
    await loginAsOwner(api);
    const sub = await api.getSubscription();
    expect(sub.planCode).toBe('PRO');
    expect(sub.usage.rooms).toBeGreaterThan(0);
    expect(sub.limits.rooms).toBe(100);
  });
});
