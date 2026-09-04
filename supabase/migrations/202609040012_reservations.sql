-- ============================================================================
-- HOUSE-ZEN — 202609040012_reservations.sql  (PHASE 4)
-- Reference format HZ-YYYY-NNNN (per-tenant counter via sequence-like table).
-- ============================================================================
create table reservations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  property_id    uuid not null references properties(id) on delete cascade,
  customer_id    uuid not null references customers(id) on delete restrict,
  reference      text not null unique,
  status         reservation_status not null default 'PENDING',
  check_in_date  date not null,
  check_out_date date not null,
  adults         int not null default 1 check (adults between 1 and 30),
  children       int not null default 0 check (children between 0 and 30),
  notes          text,
  total_amount   numeric(15,2) not null default 0,
  currency       char(3) not null default 'XAF',
  source         reservation_source not null default 'BACK_OFFICE',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (check_out_date > check_in_date)
);
create index reservations_tenant_idx  on reservations(tenant_id, status);
create index reservations_window_idx  on reservations(tenant_id, check_in_date, check_out_date);
create index reservations_customer_idx on reservations(customer_id);

create table hz_counters (
  tenant_id   uuid primary key references tenants(id) on delete cascade,
  reservation bigint not null default 0,
  invoice     bigint not null default 0
);

create trigger reservations_touch before update on reservations
  for each row execute function hz_touch_updated_at();

select hz_tenant_rls('reservations');
