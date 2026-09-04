-- ============================================================================
-- HOUSE-ZEN — 202609040009_rates.sql  (PHASE 3): base rates, seasons, rules.
-- Nightly price = base rate ± season modifier ± rule modifier (single engine).
-- ============================================================================
create table rate_seasons (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references tenants(id) on delete cascade,
  property_id      uuid not null references properties(id) on delete cascade,
  name             text not null,
  start_date       date not null,
  end_date         date not null,
  modifier_percent numeric(5,2) not null default 0 check (modifier_percent between -90 and 300),
  created_at       timestamptz not null default now(),
  check (start_date < end_date)
);
create index rate_seasons_tenant_idx on rate_seasons(tenant_id);

create table rates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  room_type_id uuid not null references room_types(id) on delete cascade,
  season_id    uuid references rate_seasons(id) on delete set null,
  price        numeric(15,2) not null check (price >= 0),
  currency     char(3) not null default 'XAF',
  valid_from   date not null default current_date,
  valid_to     date,
  created_at   timestamptz not null default now()
);
create index rates_type_idx on rates(room_type_id, valid_from);

create table rate_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  room_type_id    uuid not null references room_types(id) on delete cascade,
  min_stay_nights int not null default 1 check (min_stay_nights between 1 and 90),
  modifier_percent numeric(5,2) not null default 0,
  created_at      timestamptz not null default now()
);

select hz_tenant_rls('rate_seasons');
select hz_tenant_rls('rates');
select hz_tenant_rls('rate_rules');
