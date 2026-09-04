-- ============================================================================
-- HOUSE-ZEN — 202609040013_reservation_items.sql (PHASE 4)
-- One item = one room for the stay with HISTORICAL nightly rate (spec §16
-- analog: captured prices never recomputed retroactively).
-- ============================================================================
create table reservation_items (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  room_id        uuid not null references rooms(id) on delete restrict,
  room_type_id   uuid not null references room_types(id) on delete restrict,
  nightly_rate   numeric(15,2) not null check (nightly_rate >= 0),
  created_at     timestamptz not null default now(),
  unique (reservation_id, room_id)
);
create index reservation_items_reservation_idx on reservation_items(reservation_id);
create index reservation_items_room_idx        on reservation_items(room_id);

select hz_tenant_rls('reservation_items');
