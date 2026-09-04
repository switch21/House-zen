-- ============================================================================
-- HOUSE-ZEN — 202609040039_saas_plans.sql (PHASE 12)
-- SaaS billing (tenant pays HOUSE-ZEN) is SEPARATE from hotel billing
-- (hotel guest pays hotel) — spec: two systems never mixed.
-- ============================================================================
create table plans (
  id            uuid primary key default gen_random_uuid(),
  code          plan_code not null unique,
  name          text not null,
  monthly_price numeric(15,2) not null default 0 check (monthly_price >= 0),
  currency      char(3) not null default 'XAF',
  max_properties int not null default 1,
  max_rooms      int not null default 5,
  max_users      int not null default 2,
  stripe_price_id text,
  created_at    timestamptz not null default now()
);

alter table plans enable row level security;
create policy plans_read_all on plans for select using (true); -- public pricing

insert into hz_schema_meta(key, value) values ('migration', '202609040039_saas_plans');
