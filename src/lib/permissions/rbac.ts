/**
 * HOUSE-ZEN — RBAC permission matrix (spec §6).
 * Drives UI visibility. NEVER a security measure by itself: the same rules are
 * enforced in PostgreSQL (RLS + SECURITY DEFINER functions) and the data layer.
 */

import type { UserRole } from '@/types/domain';

export const PERMISSIONS = [
  'properties.read', 'properties.write',
  'buildings.read', 'buildings.write',
  'room_types.read', 'room_types.write',
  'rooms.read', 'rooms.write',
  'amenities.read', 'amenities.write',
  'rates.read', 'rates.write',
  'customers.read', 'customers.write',
  'reservations.read', 'reservations.write', 'reservations.cancel', 'reservations.checkin', 'reservations.checkout',
  'services.read', 'services.write',
  'housekeeping.read', 'housekeeping.write',
  'maintenance.read', 'maintenance.write',
  'invoices.read', 'invoices.write',
  'payments.read', 'payments.write',
  'expenses.read', 'expenses.write',
  'suppliers.read', 'suppliers.write',
  'reports.read', 'audit.read',
  'team.read', 'team.write',
  'settings.read', 'settings.write',
  'subscription.read', 'subscription.write',
  'admin.tenants', 'admin.users', 'admin.plans', 'admin.feature_flags', 'admin.impersonate',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const OWNER: Permission[] = [...PERMISSIONS];

const MANAGER: Permission[] = PERMISSIONS.filter(
  (p) => !p.startsWith('admin.') && p !== 'subscription.write',
);

const RECEPTIONIST: Permission[] = [
  'properties.read', 'buildings.read', 'room_types.read', 'rooms.read', 'amenities.read', 'rates.read',
  'customers.read', 'customers.write',
  'reservations.read', 'reservations.write', 'reservations.cancel', 'reservations.checkin', 'reservations.checkout',
  'services.read', 'services.write',
  'housekeeping.read', 'maintenance.read',
  'invoices.read', 'payments.read', 'payments.write',
  'reports.read', 'settings.read', 'subscription.read',
];

const ACCOUNTANT: Permission[] = [
  'properties.read', 'rooms.read', 'room_types.read', 'customers.read', 'reservations.read', 'services.read',
  'invoices.read', 'invoices.write',
  'payments.read', 'payments.write',
  'expenses.read', 'expenses.write',
  'suppliers.read', 'suppliers.write',
  'reports.read', 'settings.read', 'subscription.read',
];

const HOUSEKEEPING: Permission[] = [
  'properties.read', 'rooms.read', 'housekeeping.read', 'housekeeping.write', 'maintenance.read',
];

const MAINTENANCE: Permission[] = [
  'properties.read', 'rooms.read', 'maintenance.read', 'maintenance.write', 'housekeeping.read',
];

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  owner: OWNER,
  manager: MANAGER,
  receptionist: RECEPTIONIST,
  accountant: ACCOUNTANT,
  housekeeping: HOUSEKEEPING,
  maintenance: MAINTENANCE,
  super_admin: [...PERMISSIONS],
};

export function can(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function canAll(role: UserRole, permissions: Permission[]): boolean {
  return permissions.every((p) => can(role, p));
}

export function canAny(role: UserRole, permissions: Permission[]): boolean {
  return permissions.some((p) => can(role, p));
}

/** Route → permission map consumed by the router's guarded() helper.
 *  Dynamic segments are registered as ':id' templates. Deliberately absent:
 *  '/app/dashboard' and '/app/notifications' — open to every authenticated
 *  role by design (landing + notification bell must work for all 7 roles). */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  '/app/properties': 'properties.read',
  '/app/buildings': 'buildings.read',
  '/app/room-types': 'room_types.read',
  '/app/rooms': 'rooms.read',
  '/app/amenities': 'amenities.read',
  '/app/rates': 'rates.read',
  '/app/customers': 'customers.read',
  '/app/customers/:id': 'customers.read',
  '/app/reservations': 'reservations.read',
  '/app/calendar': 'reservations.read',
  '/app/checkins': 'reservations.checkin',
  '/app/checkouts': 'reservations.checkout',
  '/app/services': 'services.read',
  '/app/housekeeping': 'housekeeping.read',
  '/app/maintenance': 'maintenance.read',
  '/app/invoices': 'invoices.read',
  '/app/payments': 'payments.read',
  '/app/expenses': 'expenses.read',
  '/app/suppliers': 'suppliers.read',
  '/app/reports': 'reports.read',
  '/app/team': 'team.read',
  '/app/settings': 'settings.read',
  '/app/subscription': 'subscription.read',
  '/app/audit': 'audit.read',
  '/admin': 'admin.tenants',
  '/admin/dashboard': 'admin.tenants',
  '/admin/tenants': 'admin.tenants',
  '/admin/users': 'admin.users',
  '/admin/plans': 'admin.plans',
};
