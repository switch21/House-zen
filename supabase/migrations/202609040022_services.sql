-- ============================================================================
-- HOUSE-ZEN — 202609040022_services.sql (PHASE 5, spec §16)
-- Service orders snapshot the historical price — never recomputed retroactively.
-- ============================================================================
create table services (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  property_id uuid references properties(id) on delete cascade,
  name        text not null,
  description text,
  price       numeric(15,2) not null check (price >= 0),
  currency    char(3) not null default 'XAF',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
create index services_tenant_idx on services(tenant_id);

create table service_orders (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  reservation_id uuid not null references reservations(id) on delete cascade,
  service_id     uuid not null references services(id) on delete restrict,
  service_name   text not null,
  unit_price     numeric(15,2) not null,
  quantity       int not null default 1 check (quantity between 1 and 1000),
  total          numeric(15,2) not null,
  currency       char(3) not null default 'XAF',
  created_at     timestamptz not null default now()
);
create index service_orders_res_idx on service_orders(reservation_id);

select hz_tenant_rls('services');
select hz_tenant_rls('service_orders');
