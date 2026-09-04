-- ============================================================================
-- HOUSE-ZEN — 202609040006_room_types.sql  (PHASE 3)
-- ============================================================================
create table room_types (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  property_id   uuid not null references properties(id) on delete cascade,
  name          text not null,
  description   text not null default '',
  max_occupancy int  not null default 2 check (max_occupancy between 1 and 20),
  base_price    numeric(15,2) not null default 0 check (base_price >= 0),
  created_at    timestamptz not null default now()
);
create index room_types_tenant_idx   on room_types(tenant_id);
create index room_types_property_idx on room_types(property_id);

select hz_tenant_rls('room_types');
