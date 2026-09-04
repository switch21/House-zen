-- ============================================================================
-- HOUSE-ZEN — 202609040048_billing_functions.sql (PHASE 12)
-- Subscription context, Super Admin stats, tenant lifecycle (audited).
-- ============================================================================
create or replace function get_subscription_context()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_plan plans;
  v_props int; v_rooms int; v_users int;
begin
  select p.* into v_plan
  from subscriptions s join plans p on p.id = s.plan_id
  where s.tenant_id = v_tenant;

  select count(*) into v_props from properties where tenant_id = v_tenant;
  select count(*) into v_rooms from rooms where tenant_id = v_tenant;
  select count(*) into v_users from memberships where tenant_id = v_tenant;

  return jsonb_build_object(
    'planCode', coalesce(v_plan.code, 'FREE'::plan_code),
    'usage', jsonb_build_object('properties', v_props, 'rooms', v_rooms, 'users', v_users),
    'limits', jsonb_build_object(
      'properties', coalesce(v_plan.max_properties, 0),
      'rooms', coalesce(v_plan.max_rooms, 0),
      'users', coalesce(v_plan.max_users, 0)));
end $$;

create or replace function admin_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenantCount', (select count(*) from tenants),
    'activeTenants', (select count(*) from tenants where status = 'ACTIVE'),
    'subscriptionCount', (
      select jsonb_object_agg(code, cnt) from (
        select p.code, count(s.id) as cnt
        from plans p left join subscriptions s on s.plan_id = p.id
        group by p.code) x),
    'totalRevenueMrr', (select coalesce(sum(p.monthly_price), 0)
                        from subscriptions s join plans p on p.id = s.plan_id
                        where s.status in ('TRIALING','ACTIVE')));
$$;

create or replace function admin_set_tenant_status(p_tenant_id uuid, p_status tenant_status)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  update tenants set status = p_status where id = p_tenant_id;
  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  perform hz_audit('admin.tenant_status', 'tenants', p_tenant_id, null,
                   jsonb_build_object('status', p_status));
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040048_billing_functions');
