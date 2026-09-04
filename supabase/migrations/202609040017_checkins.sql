-- ============================================================================
-- HOUSE-ZEN — 202609040017_checkins.sql (PHASE 5)
-- ============================================================================
create table checkins (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  reservation_id    uuid not null references reservations(id) on delete cascade,
  room_id           uuid not null references rooms(id) on delete restrict,
  actual_checkin_at timestamptz not null default now(),
  performed_by      uuid references profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (reservation_id)
);
create index checkins_tenant_idx on checkins(tenant_id, actual_checkin_at);

select hz_tenant_rls('checkins');
