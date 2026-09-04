-- ============================================================================
-- HOUSE-ZEN — 202609040055_customer_identity_and_times.sql
-- 1) Customer identity: ID document type / issue date / issue place
--    (the document NUMBER itself stays in the encrypted `id_document` PII
--    column — migration 052; type & issuance metadata are not sensitive
--    numbers, they are classification data and stored in clear).
-- 2) Reservations: arrival / departure TIMES (hotel day defaults 14:00 → 12:00).
-- 3) Furnished-apartment hierarchy: room_types.kind (ROOM | APARTMENT) and
--    rooms.parent_room_id (a furnished apartment unit may contain bedrooms).
-- 4) THE generic RLS fix: client-side inserts that omit tenant_id (generic
--    CRUD UI) used to fail with "new row violates row-level security policy"
--    because the WITH CHECK runs BEFORE the NOT NULL constraint. A BEFORE
--    INSERT trigger now defaults tenant_id server-side from the verified
--    context (membership OR hz.tenant_id machine GUC — migration 051), on
--    every table carrying a *_tenant_write policy. Client-supplied values
--    are preserved as-is; cross-tenant spoofing is still blocked by RLS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Customer identity document metadata
-- ---------------------------------------------------------------------------
create type customer_id_type as enum ('CNI', 'PASSEPORT', 'PERMIS', 'RECEPISSE');

alter table customers
  add column id_type        customer_id_type,
  add column id_issue_date  date check (id_issue_date is null or id_issue_date <= current_date),
  add column id_issue_place text;

-- ---------------------------------------------------------------------------
-- 2) Reservation times
-- ---------------------------------------------------------------------------
alter table reservations
  add column check_in_time  time not null default '14:00',
  add column check_out_time time not null default '12:00';

-- ---------------------------------------------------------------------------
-- 3) Furnished apartments: a unit (room_type.kind = 'APARTMENT') may contain
--    one or several bedrooms (rooms pointing at it via parent_room_id).
-- ---------------------------------------------------------------------------
create type room_kind as enum ('ROOM', 'APARTMENT');

alter table room_types
  add column kind room_kind not null default 'ROOM';

alter table rooms
  add column parent_room_id uuid references rooms(id) on delete cascade;

create index rooms_parent_idx on rooms(parent_room_id);

-- Self-containment guard + bedroom→apartment must stay inside the same property.
alter table rooms
  add constraint rooms_parent_not_self check (parent_room_id is null or parent_room_id <> id);

create or replace function hz_parent_room_same_property()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.parent_room_id is not null then
    if not exists (
      select 1 from rooms p
      where p.id = new.parent_room_id
        and p.property_id = new.property_id
        and p.tenant_id   = new.tenant_id
    ) then
      raise exception 'PARENT_ROOM_MISMATCH: parent must live in the same property'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_rooms_parent_same_property
  before insert or update of parent_room_id on rooms
  for each row execute function hz_parent_room_same_property();

-- ---------------------------------------------------------------------------
-- 4) Generic RLS insert fix — server-side tenant_id defaulting.
--    Applied to EVERY table protected by the standard *_tenant_write policy
--    (enumerate from pg_policies → future tables need one line, not a list).
-- ---------------------------------------------------------------------------
create or replace function hz_default_tenant_id()
returns trigger
language plpgsql set search_path = public as $$
begin
  if new.tenant_id is null then
    new.tenant_id := hz_current_tenant_id();
  end if;
  return new;
end;
$$;

do $apply$
declare t text;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and policyname like '%\_tenant\_write'
  loop
    execute format(
      'drop trigger if exists trg_%s_default_tenant on %I;', t, t);
    execute format(
      'create trigger trg_%s_default_tenant before insert on %I
         for each row execute function hz_default_tenant_id();', t, t);
  end loop;
end;
$apply$;

-- ---------------------------------------------------------------------------
-- 5) create_reservation_atomic — extended with optional arrival/departure
--    times (defaults keep the hotel-day convention 14:00 → 12:00).
--    Full body re-applied: single availability engine, unchanged semantics.
-- ---------------------------------------------------------------------------
create or replace function create_reservation_atomic(
  p_property_id uuid,
  p_customer_id uuid,
  p_room_id uuid,
  p_room_type_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults int,
  p_children int,
  p_notes text,
  p_source reservation_source,
  p_services jsonb default '[]',
  p_check_in_time time default '14:00',
  p_check_out_time time default '12:00'
) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_room rooms;
  v_quote jsonb;
  v_res reservations;
  v_seq bigint;
begin
  if p_check_out <= p_check_in then
    raise exception 'INVALID_DATES' using errcode = '22023';
  end if;

  -- Lock the candidate room row: concurrent bookings on the same room serialize here.
  select * into v_room from rooms
  where id = p_room_id and tenant_id = v_tenant for update;
  if not found then raise exception 'ROOM_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_room.status <> 'OPERATIONAL' then
    raise exception 'ROOM_UNAVAILABLE: room under maintenance' using errcode = '23514';
  end if;

  -- Overlap re-check AFTER acquiring the row lock → no overbooking.
  if exists (
    select 1 from reservation_items ri
    join reservations res on res.id = ri.reservation_id
    where ri.room_id = p_room_id
      and res.status in ('PENDING','CONFIRMED','CHECKED_IN')
      and p_check_in < res.check_out_date
      and p_check_out > res.check_in_date
  ) then
    raise exception 'ROOM_UNAVAILABLE: overlap on selected window' using errcode = '23514';
  end if;

  v_quote := compute_quote(p_property_id, p_room_type_id, p_room_id, p_check_in, p_check_out, p_services);

  -- Tenant-scoped reference counter (locked row on hz_counters serializes).
  insert into hz_counters(tenant_id) values (v_tenant)
  on conflict (tenant_id) do nothing;
  update hz_counters set reservation = reservation + 1
  where tenant_id = v_tenant returning reservation into v_seq;

  insert into reservations (
    tenant_id, property_id, customer_id, reference, status,
    check_in_date, check_in_time, check_out_date, check_out_time,
    adults, children, notes, total_amount, currency, source
  ) values (
    v_tenant, p_property_id, p_customer_id,
    'HZ-' || to_char(p_check_in, 'YYYY') || '-' || lpad(v_seq::text, 4, '0'),
    'CONFIRMED', p_check_in, p_check_in_time, p_check_out, p_check_out_time,
    p_adults, p_children, p_notes,
    (v_quote->>'total')::numeric(15,2),
    (select currency from tenants where id = v_tenant),
    p_source
  ) returning * into v_res;

  insert into reservation_items (tenant_id, reservation_id, room_id, room_type_id, nightly_rate)
  values (v_tenant, v_res.id, p_room_id, p_room_type_id, (v_quote->>'nightly_rate')::numeric(15,2));

  -- Primary guest snapshot.
  insert into reservation_guests (tenant_id, reservation_id, full_name, is_primary)
  select v_tenant, v_res.id, c.full_name, true
  from customers c where c.id = p_customer_id;

  insert into reservation_status_history (tenant_id, reservation_id, from_status, to_status, changed_by)
  values (v_tenant, v_res.id, null, 'CONFIRMED', auth.uid());

  perform hz_emit_event('reservation.created', jsonb_build_object(
    'reservation_id', v_res.id, 'reference', v_res.reference, 'total', v_res.total_amount));
  perform hz_audit('reservation.created', 'reservations', v_res.id, null, to_jsonb(v_res));

  return v_res;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040055_customer_identity_and_times');
