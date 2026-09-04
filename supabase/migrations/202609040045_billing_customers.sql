-- ============================================================================
-- HOUSE-ZEN — 202609040045_billing_customers.sql (PHASE 12)
-- SaaS billing customers (tenant pays HOUSE-ZEN) — separate ledger.
-- ============================================================================
create table billing_customers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null unique references tenants(id) on delete cascade,
  provider     text not null default 'stripe',
  provider_ref text not null,
  email        citext,
  created_at   timestamptz not null default now()
);

alter table billing_customers enable row level security;
create policy billing_customers_read on billing_customers
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());
