-- ============================================================================
-- HOUSE-ZEN — 202609040014_reservation_guests.sql (PHASE 4)
-- ============================================================================
create table reservation_guests (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  full_name      text not null,
  id_document    text,
  is_primary     boolean not null default false
);
create index reservation_guests_res_idx on reservation_guests(reservation_id);

select hz_tenant_rls('reservation_guests');
