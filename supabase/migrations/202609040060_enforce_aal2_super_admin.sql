-- HOUSE-ZEN — migration 060: enforce AAL2 (verified MFA) on super-admin paths.
-- Policy: every super-admin-only access (admin_* RPCs of migration 059 and every
-- super-admin RLS branch of 003/041-049/057) now additionally requires an AAL2
-- session — i.e. the operator passed a TOTP challenge for the current session.
-- Tenant-scoped branches are untouched: regular roles never satisfy
-- hz_is_super_admin(), so their AAL1 sessions keep working unchanged.
-- Escape hatch: service_role tokens carry no `aal` claim (server-side jobs,
-- Edge Functions) — they bypass the AAL check but still pass RPC-level gates.

-- 1. AAL helper — reads the PostgREST-injected JWT claims directly (no
--    dependency on auth.jwt()). Unset claims (non-HTTP contexts, direct SQL)
--    resolve to AAL1: fail-closed by design.
create or replace function public.hz_has_aal2()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select coalesce(
    c.claims ->> 'role' = 'service_role'
    or c.claims ->> 'aal' = 'aal2',
    false
  )
  from (
    select coalesce(
      nullif(current_setting('request.jwt.claims', true), ''
    )::jsonb, '{}'::jsonb) as claims
  ) c;
$$;

revoke execute on function public.hz_has_aal2() from public;
revoke execute on function public.hz_has_aal2() from anon;
grant execute on function public.hz_has_aal2() to authenticated, service_role;

-- 2. Single choke point: hz_is_super_admin() = platform operator AND verified
--    MFA session. Redefining this one function extends the requirement to all
--    13 admin_* RPCs and every super-admin RLS branch without body rewrites.
create or replace function public.hz_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.hz_has_aal2()
     and coalesce((select p.is_super_admin from profiles p where p.id = auth.uid()), false);
$$;

comment on function public.hz_has_aal2() is
  'True when the request JWT is service_role or carries aal=''aal2'' (verified MFA). Fail-closed on missing claims.';
comment on function public.hz_is_super_admin() is
  'Platform super admin WITH a verified MFA session (AAL2) — migration 060.';

-- 3. QA fix discovered while proving AAL2: the three READ RPCs of migration 059
--    (admin_list_users / admin_tenants_overview / admin_stats) had NO
--    hz_is_super_admin() gate — any authenticated user could dump the platform
--    user list (emails, memberships), tenant overview and KPIs. Add the gate
--    (SQL → PL/pgSQL for raise), mirroring the 059 write-RPC convention.
create or replace function public.admin_list_users()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  return (
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
    ) x
  );
end $$;

create or replace function public.admin_tenants_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  return (
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
    ) x
  );
end $$;

create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  return jsonb_build_object(
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
end $$;
