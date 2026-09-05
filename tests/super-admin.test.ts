/**
 * HOUSE-ZEN — Super admin back-office tests (migration 059 mirror).
 * The demo DataApi implements the same semantics as the SQL RPCs:
 * gated CRUD over users / tenants / plans, password policy, self-delete guard,
 * plan-in-use protection, FREE plan bootstrap for new tenants.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { DemoDataApi } from '@/lib/demo/api';
import { buildSeed } from '@/lib/demo/store';

describe('super admin back-office (demo mirror)', () => {
  let api: DemoDataApi;

  beforeEach(() => {
    api = new DemoDataApi(buildSeed());
  });

  it('lists users with their tenant memberships', async () => {
    const users = await api.adminListUsers();
    expect(users.length).toBeGreaterThanOrEqual(7);
    const owner = users.find((u) => u.email === 'owner@demo.house-zen.app');
    expect(owner?.memberships).toHaveLength(1);
    expect(owner?.memberships[0]?.tenant_name).toContain('Zen Hôtels');
    const superAdmin = users.find((u) => u.is_super_admin);
    expect(superAdmin?.memberships).toHaveLength(0);
  });

  it('creates a user with a valid password, rejects duplicates and short passwords', async () => {
    await api.adminCreateUser({ email: 'New.User@Example.com', full_name: 'Test User', password: 'password123' });
    const users = await api.adminListUsers();
    const created = users.find((u) => u.email === 'new.user@example.com');
    expect(created?.full_name).toBe('Test User');
    expect(created?.memberships).toHaveLength(0);

    await expect(
      api.adminCreateUser({ email: 'new.user@example.com', full_name: 'Dup', password: 'password123' }),
    ).rejects.toThrow();
    await expect(
      api.adminCreateUser({ email: 'other@example.com', full_name: 'Short', password: 'short' }),
    ).rejects.toThrow();
  });

  it('assigns a user to a tenant and removes the assignment', async () => {
    await api.adminCreateUser({ email: 'floater@example.com', full_name: 'Floater', password: 'password123' });
    const users = await api.adminListUsers();
    const user = users.find((u) => u.email === 'floater@example.com')!;
    const tenants = await api.adminTenantsOverview();
    const tenant = tenants.find((t) => t.slug === 'zen-hotels')!;

    await api.adminAssignUserToTenant(user.id, tenant.id, 'receptionist');
    const after = (await api.adminListUsers()).find((u) => u.id === user.id)!;
    expect(after.memberships[0]?.tenant_id).toBe(tenant.id);
    expect(after.memberships[0]?.role).toBe('receptionist');

    await api.adminRemoveUserFromTenant(after.memberships[0]!.membership_id);
    const final = (await api.adminListUsers()).find((u) => u.id === user.id)!;
    expect(final.memberships).toHaveLength(0);
  });

  it('refuses to delete the signed-in super admin', async () => {
    await api.signIn('admin@house-zen.app', 'demo1234');
    const users = await api.adminListUsers();
    const self = users.find((u) => u.is_super_admin)!;
    await expect(api.adminDeleteUser(self.id)).rejects.toThrow('CANNOT_DELETE_SELF');
  });

  it('platform super admin belongs to no tenant and resolves a super_admin role', async () => {
    // pat.epee-style account: profiles.is_super_admin=true, ZERO memberships —
    // the session must expose role 'super_admin' with tenant=null (never the
    // receptionist fallback) so /app/* stays out of reach (guards.tsx).
    const session = await api.signIn('admin@house-zen.app', 'demo1234');
    expect(session.isSuperAdmin).toBe(true);
    expect(session.tenant).toBeNull();
    expect(session.role).toBe('super_admin');
    expect(session.memberships).toHaveLength(0);

    const again = await api.getSession();
    expect(again?.tenant).toBeNull();
    expect(again?.role).toBe('super_admin');
  });

  it('deletes a user', async () => {
    await api.adminCreateUser({ email: 'gone@example.com', full_name: 'Gone', password: 'password123' });
    const users = await api.adminListUsers();
    const user = users.find((u) => u.email === 'gone@example.com')!;
    await api.adminDeleteUser(user.id);
    expect((await api.adminListUsers()).some((u) => u.id === user.id)).toBe(false);
  });

  it('creates a tenant on the FREE plan and tracks usage counters', async () => {
    await api.adminCreateTenant({ name: 'Hôtel Étoile', slug: 'hotel-etoile', currency: 'xaf', timezone: 'Africa/Douala', locale: 'fr' });
    const tenants = await api.adminTenantsOverview();
    const created = tenants.find((t) => t.slug === 'hotel-etoile');
    expect(created?.plan).toBe('FREE');
    expect(created?.user_count).toBe(0);
    expect(created?.status).toBe('ACTIVE');

    await expect(
      api.adminCreateTenant({ name: 'Bad Slug', slug: 'Bad Slug!', currency: 'XAF', timezone: 'x', locale: 'fr' }),
    ).rejects.toThrow('INVALID_SLUG');
  });

  it('changes a tenant plan and updates the overview', async () => {
    const tenants = await api.adminTenantsOverview();
    const tenant = tenants.find((t) => t.slug === 'hotel-concurrence')!;
    await api.adminSetTenantPlan(tenant.id, 'PRO');
    const refreshed = (await api.adminTenantsOverview()).find((t) => t.id === tenant.id)!;
    expect(refreshed.plan).toBe('PRO');
    await expect(api.adminSetTenantPlan(tenant.id, 'NOPE')).rejects.toThrow('PLAN_NOT_FOUND');
  });

  it('deletes a tenant and detaches its users', async () => {
    const tenants = await api.adminTenantsOverview();
    const tenant = tenants.find((t) => t.slug === 'hotel-concurrence')!;
    await api.adminDeleteTenant(tenant.id);
    expect((await api.adminTenantsOverview()).some((t) => t.id === tenant.id)).toBe(false);
  });

  it('manages plans: create, update, delete; refuses deleting a plan in use', async () => {
    await api.adminCreatePlan({
      code: 'PREMIUM', name: 'Premium', monthly_price: 100000, currency: 'XAF',
      max_properties: 25, max_rooms: 1000, max_users: 100, features: ['*'],
    });
    const plans = await api.adminListPlans();
    const premium = plans.find((p) => p.code === 'PREMIUM');
    expect(premium?.monthly_price).toBe(100000);

    await api.adminUpdatePlan(premium!.id, { monthly_price: 120000 });
    expect((await api.adminListPlans()).find((p) => p.id === premium!.id)?.monthly_price).toBe(120000);

    const pro = plans.find((p) => p.code === 'FREE')!;
    await expect(api.adminDeletePlan(pro.id)).rejects.toThrow('PLAN_IN_USE');

    await api.adminDeletePlan(premium!.id);
    expect((await api.adminListPlans()).some((p) => p.code === 'PREMIUM')).toBe(false);
  });

  it('exposes extended platform KPIs', async () => {
    const stats = await api.adminStats();
    expect(stats.tenantCount).toBeGreaterThanOrEqual(2);
    expect(stats.userCount).toBeGreaterThanOrEqual(7);
    expect(stats.superAdminCount).toBeGreaterThanOrEqual(1);
    expect(stats.newUsers30d).toBeGreaterThanOrEqual(1);
    expect(stats.totalRevenueMrr).toBeGreaterThan(0);
  });
});
