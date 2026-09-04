-- ============================================================================
-- HOUSE-ZEN — 202609040007_rooms.sql  (PHASE 3)
-- status + housekeeping_state are state machines (spec §12/§13).
-- ============================================================================
create table rooms (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  property_id       uuid not null references properties(id) on delete cascade,
  building_id       uuid references buildings(id) on delete set null,
  room_type_id      uuid not null references room_types(id) on delete restrict,
  room_number       text not null,
  floor             int,
  status            room_status not null default 'OPERATIONAL',
  housekeeping_state housekeeping_state not null default 'CLEAN',
  created_at        timestamptz not null default now(),
  unique (property_id, room_number)
);
create index rooms_tenant_idx   on rooms(tenant_id);
create index rooms_type_idx     on rooms(room_type_id);
create index rooms_status_idx   on rooms(tenant_id, status, housekeeping_state);

select hz_tenant_rls('rooms');

-- Controlled state machines (callable only via SECURITY DEFINER RPCs).
create or replace function set_room_housekeeping_state(p_room_id uuid, p_to_state housekeeping_state)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_from   housekeeping_state;
begin
  if not hz_has_permission(v_tenant, 'housekeeping.write') then
    raise exception 'PERMISSION_DENIED: housekeeping.write required' using errcode = '42501';
  end if;

  select r.housekeeping_state into v_from
  from rooms r where r.id = p_room_id and r.tenant_id = v_tenant for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  -- DIRTY → CLEANING → INSPECTED → CLEAN (back transitions explicit).
  if not (
       (v_from = 'DIRTY'     and p_to_state = 'CLEANING')
    or (v_from = 'CLEANING'  and p_to_state in ('INSPECTED','DIRTY'))
    or (v_from = 'INSPECTED' and p_to_state in ('CLEAN','DIRTY'))
    or (v_from = 'CLEAN'     and p_to_state = 'DIRTY')
  ) then
    raise exception 'INVALID_TRANSITION: % → %', v_from, p_to_state using errcode = '22023';
  end if;

  update rooms set housekeeping_state = p_to_state where id = p_room_id;
  insert into housekeeping_logs (tenant_id, task_id, from_state, to_state, changed_by)
  values (v_tenant, p_room_id, v_from, p_to_state, auth.uid());
  perform hz_audit('room.housekeeping_state', 'rooms', p_room_id,
                   jsonb_build_object('state', v_from), jsonb_build_object('state', p_to_state));
end $$;

create or replace function set_room_status(p_room_id uuid, p_to_status room_status)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
begin
  if not hz_has_permission(v_tenant, 'maintenance.write') and not hz_has_permission(v_tenant, 'rooms.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  if p_to_status = 'OPERATIONAL' then
    -- No room may return to service while a ticket is still active.
    if exists (select 1 from maintenance_tickets
               where room_id = p_room_id and status in ('OPEN','IN_PROGRESS')) then
      raise exception 'OPEN_TICKETS_REMAIN' using errcode = '22023';
    end if;
  end if;

  update rooms set status = p_to_status
  where id = p_room_id and tenant_id = v_tenant;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  perform hz_audit('room.status', 'rooms', p_room_id, null, jsonb_build_object('status', p_to_status));
end $$;
