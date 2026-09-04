-- ============================================================================
-- HOUSE-ZEN — 202609040032_suppliers.sql (PHASE 6)
-- ============================================================================
create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  contact_name text,
  phone        text,
  email        citext,
  created_at   timestamptz not null default now()
);
create index suppliers_tenant_idx on suppliers(tenant_id);

select hz_tenant_rls('suppliers');

-- Deferred FK from 030.
alter table expenses
  add constraint expenses_supplier_fk
  foreign key (supplier_id) references suppliers(id) on delete set null;
