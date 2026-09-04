-- ============================================================================
-- HOUSE-ZEN — 202609040020_housekeeping.sql (PHASE 5, spec §12)
-- ============================================================================
create table housekeeping_tasks (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  room_id       uuid not null references rooms(id) on delete cascade,
  assigned_to   uuid references profiles(id) on delete set null,
  status        hk_task_status not null default 'PENDING',
  priority      ticket_priority not null default 'NORMAL',
  notes         text,
  scheduled_date date not null default current_date,
  completed_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index hk_tasks_tenant_idx on housekeeping_tasks(tenant_id, status);
create index hk_tasks_room_idx   on housekeeping_tasks(room_id);

create table housekeeping_logs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  task_id    uuid not null references housekeeping_tasks(id) on delete cascade,
  from_state housekeeping_state,
  to_state   housekeeping_state not null,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

select hz_tenant_rls('housekeeping_tasks');
select hz_tenant_rls('housekeeping_logs');

-- Completing a task drives the room state machine (never UI-local state).
create or replace function complete_housekeeping_task(p_task_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_room_id uuid;
  v_state housekeeping_state;
begin
  if not hz_has_permission(v_tenant, 'housekeeping.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  select room_id into v_room_id from housekeeping_tasks
  where id = p_task_id and tenant_id = v_tenant for update;
  if not found then raise exception 'TASK_NOT_FOUND'; end if;

  update housekeeping_tasks set status = 'DONE', completed_at = now() where id = p_task_id;

  select housekeeping_state into v_state from rooms where id = v_room_id for update;
  if v_state = 'DIRTY' then
    update rooms set housekeeping_state = 'CLEANING' where id = v_room_id;
  elsif v_state = 'CLEANING' then
    update rooms set housekeeping_state = 'INSPECTED' where id = v_room_id;
  elsif v_state = 'INSPECTED' then
    update rooms set housekeeping_state = 'CLEAN' where id = v_room_id;
  end if;

  perform hz_emit_event('housekeeping.task_completed', jsonb_build_object('task_id', p_task_id));
end $$;
