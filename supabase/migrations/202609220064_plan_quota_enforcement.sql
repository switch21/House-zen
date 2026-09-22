-- ============================================================================
-- HOUSE-ZEN — 202609220064_plan_quota_enforcement.sql
-- Plan quota enforcement (spec PHASE 12): EVERY tenant write path now checks
-- the plan's max_properties / max_rooms / max_users.
--
-- hz_check_quota() existed since migration 041 but was never wired to any
-- write path. Guards MUST be server-side (BEFORE INSERT triggers) so that
-- direct CRUD inserts (generic DataApi adapter), SECURITY DEFINER RPCs and
-- any future import/ETL path are ALL covered — "always ensure a tenant
-- respects its plan constraints".
--
-- Design decisions:
--  * hz_assert_quota(p_tenant, p_kind) takes the tenant EXPLICITLY: quota
--    checks must also work from cross-tenant contexts (super-admin RPCs,
--    cron, Edge Functions) where hz_current_tenant_id() is not the target.
--  * Fail-closed: a tenant without any TRIALING/ACTIVE subscription cannot
--    create new resources (defensive — every tenant is provisioned with a
--    subscription at creation, migration 059).
--  * memberships: admin_assign_user_to_tenant re-assigns an existing user via
--    ON CONFLICT (tenant_id, user_id) DO UPDATE. A BEFORE INSERT trigger
--    still fires on that path; the guard therefore skips rows that already
--    exist (role update ≠ a new seat).
--  * Counting rows directly (source of truth) instead of trusting the
--    `usage` table (periodically recomputed, can drift). Scale is small
--    (hundreds of rows per tenant) — correctness beats counter caching.
-- ============================================================================

-- ---------------------------------------------------------------- core -----
create or replace function hz_assert_quota(p_tenant uuid, p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_plan  text;
  v_limit int;
  v_used  int;
begin
  select p.code,
         case p_kind
           when 'properties' then p.max_properties
           when 'rooms'      then p.max_rooms
           when 'users'      then p.max_users
         end
    into v_plan, v_limit
  from subscriptions s
  join plans p on p.id = s.plan_id
  where s.tenant_id = p_tenant
    and s.status in ('TRIALING', 'ACTIVE')
  order by s.created_at desc
  limit 1;

  if v_limit is null then
    raise exception 'QUOTA_EXCEEDED: % blocked (no active subscription)', p_kind
      using errcode = 'P0001';
  end if;

  v_used := case p_kind
    when 'properties' then (select count(*) from properties  where tenant_id = p_tenant)
    when 'rooms'      then (select count(*) from rooms       where tenant_id = p_tenant)
    when 'users'      then (select count(*) from memberships where tenant_id = p_tenant)
  end;

  if v_used >= v_limit then
    raise exception 'QUOTA_EXCEEDED: % limit reached (%) [plan %]', p_kind, v_limit, v_plan
      using errcode = 'P0001';
  end if;
end $$;

-- Legacy entry point (041, JWT tenant context) now delegates to the core
-- check so both APIs share one behavior.
create or replace function hz_check_quota(p_kind text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  perform hz_assert_quota(hz_current_tenant_id(), p_kind);
end $$;

-- -------------------------------------------------------------- trigger ----
create or replace function hz_quota_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Re-assignment of an existing membership (ON CONFLICT DO UPDATE) is a
  -- role update, NOT a new seat: never count it against the quota.
  if tg_table_name = 'memberships' and exists (
    select 1 from memberships m
    where m.tenant_id = new.tenant_id and m.user_id = new.user_id
  ) then
    return new;
  end if;

  perform hz_assert_quota(
    new.tenant_id,
    case tg_table_name when 'memberships' then 'users' else tg_table_name end
  );
  return new;
end $$;

create trigger quota_properties before insert on properties
  for each row execute function hz_quota_guard();

create trigger quota_rooms before insert on rooms
  for each row execute function hz_quota_guard();

create trigger quota_memberships before insert on memberships
  for each row execute function hz_quota_guard();

-- Internal helpers: never exposed through PostgREST (default PUBLIC grant
-- would otherwise expose them as REST endpoints).
revoke execute on function hz_assert_quota(uuid, text) from public, anon, authenticated;
revoke execute on function hz_check_quota(text)        from public, anon, authenticated;
revoke execute on function hz_quota_guard()            from public, anon, authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609220064_plan_quota_enforcement');
