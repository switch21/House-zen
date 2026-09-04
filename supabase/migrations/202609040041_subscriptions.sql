-- ============================================================================
-- HOUSE-ZEN — 202609040041_subscriptions.sql (PHASE 12)
-- One active subscription per tenant; trial support; dunning states.
-- ============================================================================
create table subscriptions (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null unique references tenants(id) on delete cascade,
  plan_id             uuid not null references plans(id) on delete restrict,
  status              subscription_status not null default 'TRIALING',
  current_period_start timestamptz not null default now(),
  current_period_end  timestamptz not null default now() + interval '30 days',
  trial_end           timestamptz,
  cancel_at_period_end boolean not null default false,
  coupon_id           uuid references coupons(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index subscriptions_status_idx on subscriptions(status);

alter table subscriptions enable row level security;
create policy subscriptions_read on subscriptions
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());
create policy subscriptions_write on subscriptions
  for all using (hz_is_super_admin())
  with check (hz_is_super_admin());

create trigger subscriptions_touch before update on subscriptions
  for each row execute function hz_touch_updated_at();

-- Quota enforcement hook (spec: Entitlements → Usage → Quota).
create or replace function hz_check_quota(p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_used int;
  v_limit int;
begin
  select case p_kind
    when 'properties' then (select count(*) from properties where tenant_id = v_tenant)
    when 'rooms'      then (select count(*) from rooms where tenant_id = v_tenant)
    when 'users'      then (select count(*) from memberships where tenant_id = v_tenant)
  end into v_used;

  select case p_kind
    when 'properties' then p.max_properties
    when 'rooms'      then p.max_rooms
    when 'users'      then p.max_users
  end into v_limit
  from subscriptions s join plans p on p.id = s.plan_id
  where s.tenant_id = v_tenant and s.status in ('TRIALING','ACTIVE');

  if v_used >= coalesce(v_limit, 0) then
    raise exception 'QUOTA_EXCEEDED: % limit reached (%)', p_kind, v_limit using errcode = 'P0001';
  end if;
end $$;
