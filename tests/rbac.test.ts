/**
 * HOUSE-ZEN — RBAC matrix tests (spec §6).
 */

import { describe, expect, it } from 'vitest';
import { can, canAny, canAll, ROLE_PERMISSIONS } from '@/lib/permissions/rbac';

describe('rbac', () => {
  it('owner has everything', () => {
    expect(can('owner', 'properties.write')).toBe(true);
    expect(can('owner', 'admin.tenants')).toBe(true);
  });

  it('receptionist can manage reservations but not invoices', () => {
    expect(can('receptionist', 'reservations.write')).toBe(true);
    expect(can('receptionist', 'reservations.checkin')).toBe(true);
    expect(can('receptionist', 'invoices.write')).toBe(false);
    expect(can('receptionist', 'expenses.write')).toBe(false);
  });

  it('accountant handles finance only', () => {
    expect(can('accountant', 'invoices.write')).toBe(true);
    expect(can('accountant', 'payments.write')).toBe(true);
    expect(can('accountant', 'reservations.write')).toBe(false);
    expect(can('accountant', 'housekeeping.write')).toBe(false);
  });

  it('housekeeping sees only its scope', () => {
    expect(can('housekeeping', 'housekeeping.write')).toBe(true);
    expect(can('housekeeping', 'reservations.write')).toBe(false);
    expect(can('housekeeping', 'payments.read')).toBe(false);
  });

  it('maintenance cannot checkout guests', () => {
    expect(can('maintenance', 'maintenance.write')).toBe(true);
    expect(can('maintenance', 'reservations.checkout')).toBe(false);
  });

  it('manager lacks admin & subscription.write', () => {
    expect(can('manager', 'reservations.write')).toBe(true);
    expect(can('manager', 'admin.tenants')).toBe(false);
    expect(can('manager', 'subscription.write')).toBe(false);
  });

  it('canAll / canAny combine correctly', () => {
    expect(canAll('owner', ['invoices.write', 'payments.write'])).toBe(true);
    expect(canAll('receptionist', ['invoices.write', 'payments.write'])).toBe(false);
    expect(canAny('receptionist', ['invoices.write', 'reservations.write'])).toBe(true);
  });

  it('every role has a non-empty permission set', () => {
    for (const role of Object.keys(ROLE_PERMISSIONS)) {
      expect(ROLE_PERMISSIONS[role as keyof typeof ROLE_PERMISSIONS].length).toBeGreaterThan(0);
    }
  });
});
