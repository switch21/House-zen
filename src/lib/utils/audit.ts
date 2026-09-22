/**
 * HOUSE-ZEN — Audit journal readability (spec §30).
 * Raw audit rows carry machine codes (`payment.created`, `invoices`,
 * truncated UUIDs). The journal must be human-readable: curated labels for
 * every known action, localized verb fallback, localized entity names
 * (reusing existing page-title keys), business references come from
 * hz_audit_feed (SQL) / the demo adapter.
 */

export type AuditTranslator = (key: string) => string;

/** Entity name → existing i18n page-title key (fallback: raw entity name). */
const ENTITY_TITLE_KEYS: Record<string, string> = {
  properties: 'properties.title',
  buildings: 'properties.title',
  rooms: 'rooms.title',
  room_types: 'roomTypes.title',
  amenities: 'amenities.title',
  rates: 'rates.title',
  rate_seasons: 'rates.title',
  rate_rules: 'rates.title',
  reservations: 'reservations.title',
  reservation_guests: 'reservations.title',
  customers: 'customers.title',
  services: 'services.title',
  service_orders: 'services.title',
  housekeeping_tasks: 'housekeeping.title',
  maintenance_tickets: 'maintenance.title',
  invoices: 'invoices.title',
  payments: 'payments.title',
  expenses: 'expenses.title',
  expense_categories: 'expenses.title',
  suppliers: 'suppliers.title',
  tax_rates: 'settings.taxes',
  cancellation_policies: 'settings.policies',
  memberships: 'team.title',
  profiles: 'team.title',
  subscriptions: 'subscription.title',
  plans: 'subscription.title',
};

/** Localized label for an audit action code.
 *  1. curated full-action key (audit.log.<action>) when present;
 *  2. localized verb fallback (audit.verb.<last-segment>);
 *  3. raw last segment. */
export function auditActionLabel(action: string, t: AuditTranslator): string {
  const key = `audit.log.${action}`;
  const curated = t(key);
  if (curated !== key) return curated;
  const verb = action.split('.').pop() ?? action;
  const verbKey = `audit.verb.${verb}`;
  const verbLabel = t(verbKey);
  return verbLabel !== verbKey ? verbLabel : verb;
}

/** Localized entity name for an audit row (fallback: raw entity code). */
export function auditEntityLabel(entity: string, t: AuditTranslator): string {
  const key = ENTITY_TITLE_KEYS[entity];
  if (!key) return entity;
  const label = t(key);
  return label !== key ? label : entity;
}
