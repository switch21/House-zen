-- ============================================================================
-- HOUSE-ZEN — 202609040002_security_functions.sql
-- Tenant resolution + authorization primitives (SECURITY DEFINER, lock hard).
-- auth.uid() → membership → tenant_id (spec §5).
-- ============================================================================

-- Revoke default execute from public; grants are explicit per function need.
revoke execute on function pg_catalog.current_setting(text) from public;

-- The current user's tenant: resolved server-side, never from the client.
create or replace function hz_current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select m.tenant_id
  from memberships m
  where m.user_id = auth.uid()
  order by m.created_at
  limit 1;
$$;

-- Is the caller a super operator of the platform?
create or replace function hz_is_super_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.is_super_admin from profiles p where p.id = auth.uid()), false);
$$;

-- Role of the caller within a given tenant (null if not a member).
create or replace function hz_role_in_tenant(p_tenant_id uuid)
returns user_role
language sql stable security definer set search_path = public as $$
  select m.role from memberships m
  where m.user_id = auth.uid() and m.tenant_id = p_tenant_id
  limit 1;
$$;

-- Permission matrix (mirror of src/lib/permissions/rbac.ts, spec §6).
create or replace function hz_has_permission(p_tenant_id uuid, p_permission text)
returns boolean
language sql stable security definer set search_path = public as $$
  with matrix as (
    select 'owner'::user_role as role, p.permission from (values
      ('properties.read'),('properties.write'),('buildings.read'),('buildings.write'),
      ('room_types.read'),('room_types.write'),('rooms.read'),('rooms.write'),
      ('amenities.read'),('amenities.write'),('rates.read'),('rates.write'),
      ('customers.read'),('customers.write'),('reservations.read'),('reservations.write'),
      ('reservations.cancel'),('reservations.checkin'),('reservations.checkout'),
      ('services.read'),('services.write'),('housekeeping.read'),('housekeeping.write'),
      ('maintenance.read'),('maintenance.write'),('invoices.read'),('invoices.write'),
      ('payments.read'),('payments.write'),('expenses.read'),('expenses.write'),
      ('suppliers.read'),('suppliers.write'),('reports.read'),('audit.read'),
      ('team.read'),('team.write'),('settings.read'),('settings.write'),
      ('subscription.read'),('subscription.write')
    ) as p(permission)
    union all select 'manager'::user_role, p.permission from (values
      ('properties.read'),('properties.write'),('buildings.read'),('buildings.write'),
      ('room_types.read'),('room_types.write'),('rooms.read'),('rooms.write'),
      ('amenities.read'),('amenities.write'),('rates.read'),('rates.write'),
      ('customers.read'),('customers.write'),('reservations.read'),('reservations.write'),
      ('reservations.cancel'),('reservations.checkin'),('reservations.checkout'),
      ('services.read'),('services.write'),('housekeeping.read'),('housekeeping.write'),
      ('maintenance.read'),('maintenance.write'),('invoices.read'),('invoices.write'),
      ('payments.read'),('payments.write'),('expenses.read'),('expenses.write'),
      ('suppliers.read'),('suppliers.write'),('reports.read'),('audit.read'),
      ('team.read'),('team.write'),('settings.read'),('settings.write'),('subscription.read')
    ) as p(permission)
    union all select 'receptionist'::user_role, p.permission from (values
      ('properties.read'),('buildings.read'),('room_types.read'),('rooms.read'),
      ('amenities.read'),('rates.read'),('customers.read'),('customers.write'),
      ('reservations.read'),('reservations.write'),('reservations.cancel'),
      ('reservations.checkin'),('reservations.checkout'),
      ('services.read'),('services.write'),('housekeeping.read'),('maintenance.read'),
      ('invoices.read'),('payments.read'),('payments.write'),
      ('reports.read'),('settings.read'),('subscription.read')
    ) as p(permission)
    union all select 'accountant'::user_role, p.permission from (values
      ('properties.read'),('rooms.read'),('room_types.read'),('customers.read'),
      ('reservations.read'),('services.read'),('invoices.read'),('invoices.write'),
      ('payments.read'),('payments.write'),('expenses.read'),('expenses.write'),
      ('suppliers.read'),('suppliers.write'),('reports.read'),('settings.read'),('subscription.read')
    ) as p(permission)
    union all select 'housekeeping'::user_role, p.permission from (values
      ('properties.read'),('rooms.read'),('housekeeping.read'),('housekeeping.write'),('maintenance.read')
    ) as p(permission)
    union all select 'maintenance'::user_role, p.permission from (values
      ('properties.read'),('rooms.read'),('maintenance.read'),('maintenance.write'),('housekeeping.read')
    ) as p(permission)
  )
  select exists (
    select 1
    from matrix
    where matrix.role = hz_role_in_tenant(p_tenant_id)
      and matrix.permission = p_permission
  ) or hz_is_super_admin();
$$;

-- Generic audit writer (spec §30): who/what/when/before/after + request id.
create or replace function hz_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  begin v_tenant := hz_current_tenant_id(); exception when others then v_tenant := null; end;
  insert into audit_logs (tenant_id, actor_id, action, entity, entity_id, before, after, request_id)
  values (v_tenant, auth.uid(), p_action, p_entity, p_entity_id, p_before, p_after,
          current_setting('request.header.x-request-id', true));
end $$;

-- Domain event emitter (PHASE 9): House-zen Event → Notification Engine entry.
create or replace function hz_emit_event(p_event_key text, p_payload jsonb default '{}')
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid;
begin
  begin v_tenant := hz_current_tenant_id(); exception when others then v_tenant := null; end;
  insert into domain_events (tenant_id, event_key, payload)
  values (v_tenant, p_event_key, p_payload);
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040002_security_functions');
