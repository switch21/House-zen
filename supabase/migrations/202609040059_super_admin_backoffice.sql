-- ============================================================================
-- HOUSE-ZEN — 202609040059_super_admin_backoffice.sql
-- Super Admin back-office (spec §31): full CRUD over tenants, users and plans.
--
-- Model: "super_admin" is NOT a membership role (user_role enum stays the six
-- operational roles). A super operator is profiles.is_super_admin = true and
-- belongs to no tenant. Every RPC below is SECURITY DEFINER, gated on
-- hz_is_super_admin(), and audited via hz_audit().
--
-- User creation: direct GoTrue-compatible insert into auth.users +
-- auth.identities (pgcrypto bf hash), mirroring what GoTrue's admin API does.
-- ============================================================================

-- ------------------------------------------------------------- helpers ------

-- Create an auth user + profile. Returns the new user id.
create or replace function admin_create_user(
  p_email text, p_full_name text, p_password text, p_locale text default 'fr'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email citext := lower(btrim(p_email));
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if coalesce(p_password, '') = '' then
    raise exception 'PASSWORD_REQUIRED';
  end if;
  if char_length(p_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  -- GoTrue-compatible auth row (provider email, confirmed).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name),
    now(), now()
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, last_sign_in_at, created_at, updated_at, email)
  values (
    gen_random_uuid(), v_id, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email::text, 'email_verified', true),
    now(), now(), now(), v_email
  );

  insert into profiles (id, email, full_name, locale, is_super_admin)
  values (v_id, v_email, p_full_name, p_locale, false)
  on conflict (id) do update set full_name = excluded.full_name;

  perform hz_audit('admin.user_created', 'profiles', v_id, null,
                   jsonb_build_object('email', v_email::text, 'full_name', p_full_name));
  return jsonb_build_object('id', v_id, 'email', v_email::text, 'full_name', p_full_name);
end $$;

create or replace function admin_update_user(
  p_user_id uuid, p_full_name text, p_locale text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  update profiles set
    full_name = coalesce(p_full_name, full_name),
    locale = coalesce(p_locale, locale),
    updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  update auth.users set
    raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', p_full_name)
  where id = p_user_id and p_full_name is not null;
  perform hz_audit('admin.user_updated', 'profiles', p_user_id, null,
                   jsonb_build_object('full_name', p_full_name, 'locale', p_locale));
end $$;

create or replace function admin_set_user_password(p_user_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if coalesce(p_password, '') = '' or char_length(p_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  update auth.users
  set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
      updated_at = now()
  where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  perform hz_audit('admin.user_password_reset', 'profiles', p_user_id, null, null);
end $$;

create or replace function admin_delete_user(p_user_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_email text;
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'CANNOT_DELETE_SELF';
  end if;
  select email::text into v_email from profiles where id = p_user_id;
  if not found then raise exception 'USER_NOT_FOUND'; end if;
  -- Cascades: profiles, memberships, identities, sessions (spec §5 chain).
  delete from auth.users where id = p_user_id;
  perform hz_audit('admin.user_deleted', 'profiles', p_user_id, jsonb_build_object('email', v_email), null);
end $$;

create or replace function admin_list_users()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.u order by x.created_at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', pr.id, 'email', pr.email::text, 'full_name', pr.full_name,
      'locale', pr.locale, 'is_super_admin', pr.is_super_admin,
      'created_at', pr.created_at, 'last_sign_in_at', u.last_sign_in_at,
      'memberships', coalesce((
        select jsonb_agg(jsonb_build_object(
            'membership_id', m.id, 'tenant_id', m.tenant_id,
            'tenant_name', t.name, 'role', m.role) order by m.created_at)
        from memberships m join tenants t on t.id = m.tenant_id
        where m.user_id = pr.id), '[]'::jsonb)
    ) as u, pr.created_at
    from profiles pr
    left join auth.users u on u.id = pr.id
  ) x;
$$;

create or replace function admin_assign_user_to_tenant(
  p_user_id uuid, p_tenant_id uuid, p_role user_role
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'USER_NOT_FOUND';
  end if;
  if not exists (select 1 from tenants where id = p_tenant_id) then
    raise exception 'TENANT_NOT_FOUND';
  end if;
  insert into memberships (tenant_id, user_id, role)
  values (p_tenant_id, p_user_id, p_role)
  on conflict (tenant_id, user_id) do update set role = excluded.role;
  perform hz_audit('admin.user_assigned', 'memberships', p_user_id, null,
                   jsonb_build_object('tenant_id', p_tenant_id, 'role', p_role));
end $$;

create or replace function admin_remove_user_from_tenant(p_membership_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  delete from memberships where id = p_membership_id;
  if not found then raise exception 'MEMBERSHIP_NOT_FOUND'; end if;
  perform hz_audit('admin.user_unassigned', 'memberships', p_membership_id, null, null);
end $$;

-- ------------------------------------------------------------ tenants -------

-- Rich list for the back-office table: current plan + usage counters.
create or replace function admin_tenants_overview()
returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.u order by x.created_at), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', t.id, 'name', t.name, 'slug', t.slug, 'status', t.status,
      'currency', t.currency, 'timezone', t.timezone, 'locale', t.locale,
      'created_at', t.created_at,
      'plan', (
        select p.code from subscriptions s join plans p on p.id = s.plan_id
        where s.tenant_id = t.id and s.status in ('TRIALING', 'ACTIVE')
        order by s.created_at desc limit 1),
      'user_count', (select count(*) from memberships m where m.tenant_id = t.id),
      'property_count', (select count(*) from properties pr where pr.tenant_id = t.id),
      'room_count', (select count(*) from rooms r where r.tenant_id = t.id)
    ) as u, t.created_at
    from tenants t
  ) x;
$$;

create or replace function admin_create_tenant(
  p_name text, p_slug text, p_currency text default 'XAF',
  p_timezone text default 'Africa/Douala', p_locale text default 'fr'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if btrim(p_slug) !~ '^[a-z0-9-]+$' then
    raise exception 'INVALID_SLUG';
  end if;
  insert into tenants (name, slug, currency, timezone, locale)
  values (btrim(p_name), lower(btrim(p_slug)), upper(p_currency), p_timezone, p_locale)
  returning id into v_id;
  -- Every tenant starts on the FREE plan.
  insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  select v_id, p.id, 'ACTIVE', now(), now() + interval '1 year'
  from plans p where p.code = 'FREE';
  perform hz_audit('admin.tenant_created', 'tenants', v_id, null,
                   jsonb_build_object('name', p_name, 'slug', p_slug));
  return jsonb_build_object('id', v_id, 'slug', lower(btrim(p_slug)));
end $$;

create or replace function admin_update_tenant(
  p_tenant_id uuid, p_name text default null, p_slug text default null,
  p_status tenant_status default null, p_currency text default null,
  p_timezone text default null, p_locale text default null
) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if p_slug is not null and btrim(p_slug) !~ '^[a-z0-9-]+$' then
    raise exception 'INVALID_SLUG';
  end if;
  update tenants set
    name = coalesce(p_name, name),
    slug = coalesce(lower(btrim(p_slug)), slug),
    status = coalesce(p_status, status),
    currency = coalesce(upper(p_currency), currency),
    timezone = coalesce(p_timezone, timezone),
    locale = coalesce(p_locale, locale),
    updated_at = now()
  where id = p_tenant_id;
  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  perform hz_audit('admin.tenant_updated', 'tenants', p_tenant_id, null,
                   jsonb_build_object('name', p_name, 'slug', p_slug, 'status', p_status));
end $$;

create or replace function admin_delete_tenant(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  delete from tenants where id = p_tenant_id; -- FK on delete cascade everywhere
  if not found then raise exception 'TENANT_NOT_FOUND'; end if;
  perform hz_audit('admin.tenant_deleted', 'tenants', p_tenant_id, null, null);
end $$;

create or replace function admin_set_tenant_plan(p_tenant_id uuid, p_plan_code text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_plan plans;
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  select * into v_plan from plans where code = p_plan_code;
  if not found then raise exception 'PLAN_NOT_FOUND'; end if;
  update subscriptions
  set status = 'CANCELLED', current_period_end = now()
  where tenant_id = p_tenant_id and status in ('TRIALING', 'ACTIVE', 'PAST_DUE');
  insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
  values (p_tenant_id, v_plan.id, 'ACTIVE', now(), now() + interval '1 year');
  perform hz_audit('admin.tenant_plan_changed', 'subscriptions', p_tenant_id, null,
                   jsonb_build_object('plan', p_plan_code));
end $$;

-- -------------------------------------------------------------- plans -------
-- Direct table CRUD for super admin (SELECT was already public for pricing).
-- plans.code widens from enum to text: plan CRUD means operators can mint new
-- codes (PREMIUM, …) without a migration. The plan_code enum type stays for
-- change_plan backwards compatibility; comparisons become text = text.

create policy plans_admin_write on plans
  for all to authenticated
  using (hz_is_super_admin()) with check (hz_is_super_admin());

alter table plans alter column code type text using code::text;
alter table plans add constraint plans_code_format check (btrim(code) <> '' and char_length(code) <= 20);

-- plan_code enum → text fallout: redefine the two functions comparing codes.
-- The enum overload of change_plan is DROPPED: PostgREST cannot pick between
-- change_plan(plan_code) and change_plan(text) for a JSON string argument.
drop function if exists change_plan(plan_code);
create or replace function change_plan(p_plan_code text)
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
    'planCode', coalesce(v_plan.code, 'FREE'),
    'usage', jsonb_build_object('properties', v_props, 'rooms', v_rooms, 'users', v_users),
    'limits', jsonb_build_object(
      'properties', coalesce(v_plan.max_properties, 0),
      'rooms', coalesce(v_plan.max_rooms, 0),
      'users', coalesce(v_plan.max_users, 0)));
end $$;

-- -------------------------------------------------------------- stats -------

create or replace function admin_stats()
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tenantCount', (select count(*) from tenants),
    'activeTenants', (select count(*) from tenants where status = 'ACTIVE'),
    'suspendedTenants', (select count(*) from tenants where status = 'SUSPENDED'),
    'userCount', (select count(*) from profiles),
    'superAdminCount', (select count(*) from profiles where is_super_admin),
    'newUsers30d', (select count(*) from profiles where created_at >= now() - interval '30 days'),
    'subscriptionCount', (
      select coalesce(jsonb_object_agg(code, cnt), '{}'::jsonb) from (
        select p.code, count(s.id) as cnt
        from plans p left join subscriptions s on s.plan_id = p.id
        group by p.code) x),
    'totalRevenueMrr', (select coalesce(sum(p.monthly_price), 0)
                        from subscriptions s join plans p on p.id = s.plan_id
                        where s.status in ('TRIALING','ACTIVE')));
$$;

-- Admin surface requires a session (auth.uid() inside hz_is_super_admin()).
revoke execute on function admin_create_user(text, text, text, text) from public, anon;
revoke execute on function admin_update_user(uuid, text, text) from public, anon;
revoke execute on function admin_set_user_password(uuid, text) from public, anon;
revoke execute on function admin_delete_user(uuid) from public, anon;
revoke execute on function admin_list_users() from public, anon;
revoke execute on function admin_assign_user_to_tenant(uuid, uuid, user_role) from public, anon;
revoke execute on function admin_remove_user_from_tenant(uuid) from public, anon;
revoke execute on function admin_create_tenant(text, text, text, text, text) from public, anon;
revoke execute on function admin_update_tenant(uuid, text, text, tenant_status, text, text, text) from public, anon;
revoke execute on function admin_delete_tenant(uuid) from public, anon;
revoke execute on function admin_set_tenant_plan(uuid, text) from public, anon;
revoke execute on function admin_tenants_overview() from public, anon;
revoke execute on function admin_stats() from public, anon;
grant execute on function admin_stats() to authenticated;
grant execute on function admin_list_users() to authenticated;
grant execute on function admin_tenants_overview() to authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609040059_super_admin_backoffice');
