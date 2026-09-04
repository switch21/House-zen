-- ============================================================================
-- HOUSE-ZEN — 202609040023_tax_rates.sql (PHASE 6)
-- ============================================================================
create table tax_rates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  rate_percent numeric(5,2) not null check (rate_percent >= 0 and rate_percent <= 100),
  is_default   boolean not null default false,
  created_at   timestamptz not null default now()
);
create index tax_rates_tenant_idx on tax_rates(tenant_id);

select hz_tenant_rls('tax_rates');
