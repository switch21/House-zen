-- ============================================================================
-- HOUSE-ZEN — 202609040040_plan_features.sql (PHASE 12)
-- Entitlements per plan (features matrix) + coupon codes.
-- ============================================================================
create table plan_entitlements (
  plan_id  uuid not null references plans(id) on delete cascade,
  feature  text not null,
  primary key (plan_id, feature)
);

alter table plan_entitlements enable row level security;
create policy plan_entitlements_read on plan_entitlements for select using (true);

create table coupons (
  id            uuid primary key default gen_random_uuid(),
  code          text not null unique,
  percent_off   numeric(5,2) not null check (percent_off between 0 and 100),
  max_redemptions int,
  valid_until   date,
  created_at    timestamptz not null default now()
);
alter table coupons enable row level security;
create policy coupons_read on coupons for select using (true);

insert into hz_schema_meta(key, value) values ('migration', '202609040040_plan_features');
