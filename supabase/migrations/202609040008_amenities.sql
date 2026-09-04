-- ============================================================================
-- HOUSE-ZEN — 202609040008_amenities.sql  (PHASE 3)
-- ============================================================================
create table amenities (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  icon       text not null default 'check',
  created_at timestamptz not null default now()
);
create index amenities_tenant_idx on amenities(tenant_id);

create table room_amenities (
  room_type_id uuid not null references room_types(id) on delete cascade,
  amenity_id   uuid not null references amenities(id)  on delete cascade,
  tenant_id    uuid not null references tenants(id)    on delete cascade,
  primary key (room_type_id, amenity_id)
);

select hz_tenant_rls('amenities');
select hz_tenant_rls('room_amenities');
