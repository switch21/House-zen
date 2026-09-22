/**
 * HOUSE-ZEN — Plan quota enforcement tests (spec PHASE 12, migration 064).
 * The DemoDataApi mirrors the production BEFORE INSERT triggers
 * (properties / rooms / memberships) and the change_plan downgrade guard.
 * Canonical error message is shared by both adapters so the UI parses either.
 */

import { describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed, DEMO_TENANT_ID, DEMO_TENANT_B_ID } from '@/lib/demo/store';
import { friendlyErrorMessage, parseQuotaViolation } from '@/lib/utils/quota';

const T = DEMO_TENANT_ID;
const B = DEMO_TENANT_B_ID;

async function loginAsOwner(api: DemoDataApi) {
  await api.signIn('owner@demo.house-zen.app', 'demo1234');
}

function newApi(mutate?: (seed: ReturnType<typeof buildSeed>) => void) {
  const seed = buildSeed();
  mutate?.(seed);
  return new DemoDataApi(seed);
}

describe('quota error pipeline (canonical message)', () => {
  it('parses the SQL trigger message format', () => {
    const v = parseQuotaViolation('QUOTA_EXCEEDED: rooms limit reached (5) [plan FREE]');
    expect(v).toEqual({ kind: 'rooms', limit: 5, plan: 'FREE' });
  });

  it('parses messages without plan suffix and rejects non-quota errors', () => {
    expect(parseQuotaViolation('QUOTA_EXCEEDED: users limit reached (2)')).toEqual({
      kind: 'users',
      limit: 2,
      plan: null,
    });
    expect(parseQuotaViolation('PERMISSION_DENIED: super admin only')).toBeNull();
  });

  it('translates quota violations and keeps other errors intact', () => {
    const t = (key: string, vars?: Record<string, string | number>) =>
      `${key}:${vars?.limit ?? ''}:${vars?.plan ?? ''}`;
    const err = new Error('properties: QUOTA_EXCEEDED: properties limit reached (1) [plan FREE]');
    expect(friendlyErrorMessage(err, t)).toBe('errors.quota.properties:1:FREE');
    expect(friendlyErrorMessage(new Error('Error: boom'), t)).toBe('boom');
    expect(friendlyErrorMessage('QUOTA_EXCEEDED: usage exceeds target plan', t)).toBe('errors.quota::');
  });
});

describe('demo adapter quota guards (server parity, migration 064)', () => {
  it('blocks the 3rd property on PRO (seed: 2/3), allows up to the limit', async () => {
    const api = newApi();
    await loginAsOwner(api);
    await expect(
      api.create('properties', { name: 'Zen Kribi', property_type: 'HOTEL' }),
    ).resolves.toBeTruthy();
    await expect(
      api.create('properties', { name: 'Zen Limbé', property_type: 'HOTEL' }),
    ).rejects.toThrow(/QUOTA_EXCEEDED: properties limit reached \(3\) \[plan PRO\]/);
  });

  it('fail-closed: rooms blocked when the plan is downgraded below current usage', async () => {
    // Switch tenant T (19 rooms) to the FREE plan (max 5).
    const api = newApi((seed) => {
      const sub = seed.subscriptions.find((s) => s.tenant_id === T);
      if (sub) sub.plan_id = 'pl-free';
    });
    await loginAsOwner(api);
    await expect(
      api.create('rooms', { property_id: 'p-douala', building_id: 'b-main', room_type_id: 'rt-standard', room_number: '999', floor: 9 }),
    ).rejects.toThrow(/QUOTA_EXCEEDED: rooms limit reached \(5\) \[plan FREE\]/);
  });

  it('tenant B (FREE): 1 property and 5 rooms allowed, 6th room blocked', async () => {
    const api = newApi();
    await api.signIn('admin@house-zen.app', 'demo1234'); // super admin operator view
    // Give B its single allowed seat, then act as that tenant owner.
    await api.adminAssignUserToTenant('u-housekeeping', B, 'owner');
    await api.signIn('menage@demo.house-zen.app', 'demo1234');
    const prop = await api.create('properties', { name: 'Concurrence Douala', property_type: 'HOTEL' });
    await expect(
      api.create('properties', { name: 'Second site', property_type: 'HOTEL' }),
    ).rejects.toThrow(/properties limit reached \(1\) \[plan FREE\]/);
    for (const n of [1, 2, 3, 4, 5]) {
      await expect(
        api.create('rooms', { property_id: prop.id, room_type_id: 'rt-standard', room_number: `${n}`, floor: 1 }),
      ).resolves.toBeTruthy();
    }
    await expect(
      api.create('rooms', { property_id: prop.id, room_type_id: 'rt-standard', room_number: '6', floor: 1 }),
    ).rejects.toThrow(/rooms limit reached \(5\) \[plan FREE\]/);
  });

  it('users quota: FREE allows 2 seats; re-assignment (role update) is free', async () => {
    const api = newApi();
    await api.signIn('admin@house-zen.app', 'demo1234');
    await expect(api.adminAssignUserToTenant('u-housekeeping', B, 'owner')).resolves.toBeUndefined();
    await expect(api.adminAssignUserToTenant('u-maintenance', B, 'receptionist')).resolves.toBeUndefined();
    await expect(api.adminAssignUserToTenant('u-accountant', B, 'accountant')).rejects.toThrow(
      /QUOTA_EXCEEDED: users limit reached \(2\) \[plan FREE\]/,
    );
    // Same tenant again = role update, NOT a new seat.
    await expect(api.adminAssignUserToTenant('u-housekeeping', B, 'manager')).resolves.toBeUndefined();
  });

  it('change_plan downgrade guard: usage above the target plan is refused', async () => {
    const api = newApi();
    await loginAsOwner(api);
    // 19 rooms + 6 users > FREE limits (5/2).
    await expect(api.changePlan('FREE')).rejects.toThrow(/QUOTA_EXCEEDED: usage exceeds target plan/);
    await expect(api.changePlan('BUSINESS')).resolves.toBeUndefined();
    const sub = await api.getSubscription();
    expect(sub.planCode).toBe('BUSINESS');
    expect(sub.usage).toMatchObject({ properties: 2, rooms: 19, users: 6 });
    expect(sub.limits).toMatchObject({ properties: 10, rooms: 400, users: 50 });
  });
});
