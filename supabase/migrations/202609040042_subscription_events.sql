-- ============================================================================
-- HOUSE-ZEN — 202609040042_subscription_events.sql (PHASE 12)
-- Full lifecycle trail: trial, upgrade, downgrade, suspension, reactivation.
-- ============================================================================
create table subscription_events (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  event_type     text not null,
  from_plan_id   uuid references plans(id),
  to_plan_id     uuid references plans(id),
  metadata       jsonb not null default '{}',
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);
create index subscription_events_tenant_idx on subscription_events(tenant_id, created_at);

alter table subscription_events enable row level security;
create policy subscription_events_read on subscription_events
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());

-- Plan change (audited + evented). Downgrade validates current usage fits.
create or replace function change_plan(p_plan_code plan_code)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_plan plans;
  v_current plans;
begin
  if not hz_has_permission(v_tenant, 'subscription.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_plan from plans where code = p_plan_code;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;

  select p.* into v_current
  from subscriptions s join plans p on p.id = s.plan_id
  where s.tenant_id = v_tenant;

  -- Downgrade guard: current usage must fit the new plan.
  if (select count(*) from properties where tenant_id = v_tenant) > v_plan.max_properties
     or (select count(*) from rooms where tenant_id = v_tenant) > v_plan.max_rooms
     or (select count(*) from memberships where tenant_id = v_tenant) > v_plan.max_users then
    raise exception 'QUOTA_EXCEEDED: usage exceeds target plan' using errcode = 'P0001';
  end if;

  update subscriptions set plan_id = v_plan.id, status = 'ACTIVE'
  where tenant_id = v_tenant;

  insert into subscription_events (tenant_id, event_type, from_plan_id, to_plan_id, created_by)
  values (v_tenant, 'plan_changed', v_current.id, v_plan.id, auth.uid());

  perform hz_audit('subscription.plan_changed', 'subscriptions', null,
    jsonb_build_object('from', v_current.code), jsonb_build_object('to', v_plan.code));
end $$;
