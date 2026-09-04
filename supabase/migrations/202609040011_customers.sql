-- ============================================================================
-- HOUSE-ZEN — 202609040011_customers.sql  (PHASE 4)
-- ============================================================================
create table customers (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  full_name   text not null,
  email       citext,
  phone       text not null default '',
  country     text,
  id_document text,
  notes       text,
  created_at  timestamptz not null default now()
);
create index customers_tenant_idx on customers(tenant_id);
create index customers_email_idx  on customers(tenant_id, email);

select hz_tenant_rls('customers');
