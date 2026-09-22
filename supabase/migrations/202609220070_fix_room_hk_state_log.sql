-- ============================================================================
-- HOUSE-ZEN — 202609220070_fix_room_hk_state_log.sql
-- ROOT CAUSE (user-reported: "démarrer le nettoyage" → « Une erreur est
-- survenue »): set_room_housekeeping_state() inserted the ROOM id into
-- housekeeping_logs.task_id — a FK to housekeeping_tasks → every real
-- transition (DIRTY→CLEANING→INSPECTED→CLEAN and task completion cascades)
-- failed with 23503 after the room row was already updated in-transaction
-- (statement rolled back, room stayed DIRTY, UI showed the generic error).
-- Fix: housekeeping_logs gains a proper room_id (nullable task_id) and the
-- RPC writes room_id. Demo adapter mirrors the same shape (parity).
-- ============================================================================

alter table housekeeping_logs
  alter column task_id drop not null;

alter table housekeeping_logs
  add column if not exists room_id uuid references rooms(id) on delete cascade;

create index if not exists hk_logs_room_idx on housekeeping_logs(room_id);

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
  insert into housekeeping_logs (tenant_id, room_id, task_id, from_state, to_state, changed_by)
  values (v_tenant, p_room_id, null, v_from, p_to_state, auth.uid());
  perform hz_audit('room.housekeeping_state', 'rooms', p_room_id,
                   jsonb_build_object('state', v_from), jsonb_build_object('state', p_to_state));
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609220070_fix_room_hk_state_log')
on conflict do nothing;
