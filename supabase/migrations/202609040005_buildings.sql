-- ============================================================================
-- HOUSE-ZEN — 202609040005_buildings.sql  (PHASE 3)
-- ============================================================================
create table buildings (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  property_id uuid not null references properties(id) on delete cascade,
  name        text not null,
  floors      int  not null default 1 check (floors between 0 and 200),
  created_at  timestamptz not null default now()
);
create index buildings_tenant_idx   on buildings(tenant_id);
create index buildings_property_idx on buildings(property_id);

select hz_tenant_rls('buildings');
