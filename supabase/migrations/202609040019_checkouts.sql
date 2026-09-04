-- ============================================================================
-- HOUSE-ZEN — 202609040019_checkouts.sql (PHASE 5)
-- ============================================================================
create table checkouts (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null references tenants(id) on delete cascade,
  reservation_id     uuid not null references reservations(id) on delete cascade,
  room_id            uuid not null references rooms(id) on delete restrict,
  actual_checkout_at timestamptz not null default now(),
  balance_due        numeric(15,2) not null default 0,
  balance_cleared    boolean not null default true,
  performed_by       uuid references profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (reservation_id)
);
create index checkouts_tenant_idx on checkouts(tenant_id, actual_checkout_at);

select hz_tenant_rls('checkouts');
