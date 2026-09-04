-- ============================================================================
-- HOUSE-ZEN — 202609040021_maintenance.sql (PHASE 5, spec §13)
-- A room with an active ticket is UNDER_MAINTENANCE → never bookable.
-- ============================================================================
create table maintenance_tickets (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  room_id     uuid not null references rooms(id) on delete cascade,
  title       text not null,
  description text,
  status      ticket_status not null default 'OPEN',
  priority    ticket_priority not null default 'NORMAL',
  reported_by uuid references profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index mt_tickets_tenant_idx on maintenance_tickets(tenant_id, status);
create index mt_tickets_room_idx   on maintenance_tickets(room_id);

create table maintenance_logs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  ticket_id  uuid not null references maintenance_tickets(id) on delete cascade,
  message    text not null,
  changed_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

select hz_tenant_rls('maintenance_tickets');
select hz_tenant_rls('maintenance_logs');

-- Creating a ticket automatically takes the room offline (server-side rule).
create or replace function hz_on_ticket_created()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'OPEN' then
    update rooms set status = 'UNDER_MAINTENANCE' where id = new.room_id;
    perform hz_emit_event('maintenance.ticket_created',
      jsonb_build_object('ticket_id', new.id, 'room_id', new.room_id, 'title', new.title));
  end if;
  return new;
end $$;

create trigger mt_ticket_created after insert on maintenance_tickets
  for each row execute function hz_on_ticket_created();

create or replace function resolve_maintenance_ticket(p_ticket_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_room_id uuid;
begin
  if not hz_has_permission(v_tenant, 'maintenance.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  select room_id into v_room_id from maintenance_tickets
  where id = p_ticket_id and tenant_id = v_tenant for update;
  if not found then raise exception 'TICKET_NOT_FOUND'; end if;

  update maintenance_tickets set status = 'RESOLVED', resolved_at = now() where id = p_ticket_id;

  -- Room may return to service only if NO other active ticket remains.
  if not exists (select 1 from maintenance_tickets
                 where room_id = v_room_id and status in ('OPEN','IN_PROGRESS')) then
    update rooms set status = 'OPERATIONAL' where id = v_room_id;
  end if;

  perform hz_emit_event('maintenance.ticket_resolved', jsonb_build_object('ticket_id', p_ticket_id));
  perform hz_audit('maintenance.resolved', 'maintenance_tickets', p_ticket_id, null, null);
end $$;
