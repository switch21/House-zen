-- ============================================================================
-- HOUSE-ZEN — 202609040015_reservation_status_history.sql (PHASE 4)
-- Full trail of every transition — append-only (no update/delete policies).
-- ============================================================================
create table reservation_status_history (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  from_status    reservation_status,
  to_status      reservation_status not null,
  changed_by     uuid references profiles(id) on delete set null,
  reason         text,
  created_at     timestamptz not null default now()
);
create index reservation_status_history_res_idx on reservation_status_history(reservation_id);

alter table reservation_status_history enable row level security;
create policy rsh_select on reservation_status_history
  for select using (tenant_id = hz_current_tenant_id());
create policy rsh_insert on reservation_status_history
  for insert with check (tenant_id = hz_current_tenant_id());
