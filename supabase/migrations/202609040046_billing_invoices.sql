-- ============================================================================
-- HOUSE-ZEN — 202609040046_billing_invoices.sql (PHASE 12)
-- HOUSE-ZEN → tenant invoices (SaaS side). Immutable once finalized.
-- ============================================================================
create table billing_invoices (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  number       text not null unique,
  amount       numeric(15,2) not null,
  currency     char(3) not null default 'XAF',
  status       text not null default 'OPEN' check (status in ('OPEN','PAID','VOID','UNCOLLECTIBLE')),
  period_start date,
  period_end   date,
  provider_ref text,
  created_at   timestamptz not null default now()
);
create index billing_invoices_tenant_idx on billing_invoices(tenant_id, created_at);

alter table billing_invoices enable row level security;
create policy billing_invoices_read on billing_invoices
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());
