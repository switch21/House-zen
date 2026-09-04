-- ============================================================================
-- HOUSE-ZEN — 202609040016_reservation_functions.sql (PHASE 4)
-- THE single availability engine + atomic reservation creation (spec §10 & §18).
-- No overbooking is possible: locking (FOR UPDATE) + overlap re-check inside
-- the same transaction + blocking-status filter. Used by back-office, calendar,
-- public widget and future OTA/API — one engine only.
-- ============================================================================

-- Rooms of a type available for the window (excludes maintenance + booked).
create or replace function hz_available_rooms(
  p_property_id uuid,
  p_check_in date,
  p_check_out date
) returns setof rooms
language sql stable security definer set search_path = public as $$
  select r.*
  from rooms r
  where r.property_id = p_property_id
    and r.status = 'OPERATIONAL'
    and not exists (
      select 1
      from reservation_items ri
      join reservations res on res.id = ri.reservation_id
      where ri.room_id = r.id
        and res.status in ('PENDING','CONFIRMED','CHECKED_IN')  -- blocking statuses
        and p_check_in < res.check_out_date                     -- spec §10 rule
        and p_check_out > res.check_in_date
    );
$$;

-- Nightly rate resolution: base rate ± active season modifier (single source).
create or replace function hz_nightly_rate(p_room_type_id uuid, p_check_in date)
returns numeric(15,2)
language sql stable security definer set search_path = public as $$
  select round(
    coalesce(b.price, rt.base_price) * (1 + coalesce(s.modifier_percent, 0) / 100.0), 2)
  from room_types rt
  left join lateral (
    select rate.price from rates rate
    where rate.room_type_id = p_room_type_id
      and rate.valid_from <= p_check_in
      and (rate.valid_to is null or rate.valid_to >= p_check_in)
    order by rate.valid_from desc limit 1
  ) b on true
  left join lateral (
    select rs.modifier_percent from rate_seasons rs
    join properties pr on pr.id = rt.property_id
    where rs.property_id = pr.id
      and p_check_in between rs.start_date and rs.end_date
    limit 1
  ) s on true
  where rt.id = p_room_type_id;
$$;

-- Public-friendly typed availability per room type.
create or replace function search_available_room_types(
  p_property_id uuid,
  p_check_in date,
  p_check_out date,
  p_adults int
) returns table (
  room_type_id uuid, name text, description text, max_occupancy int,
  available_rooms bigint, nightly_rate numeric(15,2), currency char(3), amenities jsonb
)
language sql stable security definer set search_path = public as $$
  select
    rt.id, rt.name, rt.description, rt.max_occupancy,
    count(r.id) as available_rooms,
    hz_nightly_rate(rt.id, p_check_in),
    t.currency,
    coalesce(jsonb_agg(distinct a.name) filter (where a.name is not null), '[]'::jsonb)
  from room_types rt
  join tenants t on t.id = rt.tenant_id
  left join hz_available_rooms(p_property_id, p_check_in, p_check_out) r on r.room_type_id = rt.id
  left join room_amenities ra on ra.room_type_id = rt.id
  left join amenities a on a.id = ra.amenity_id
  where rt.property_id = p_property_id
    and rt.max_occupancy >= p_adults
  group by rt.id, rt.name, rt.description, rt.max_occupancy, t.currency
  having count(r.id) > 0;
$$;

-- Quote (taxes from tenant default tax rate; services priced at historical rates).
create or replace function compute_quote(
  p_property_id uuid,
  p_room_type_id uuid,
  p_room_id uuid,
  p_check_in date,
  p_check_out date,
  p_services jsonb default '[]'
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_nights int := (p_check_out - p_check_in);
  v_rate numeric(15,2) := hz_nightly_rate(p_room_type_id, p_check_in);
  v_room_total numeric(15,2) := round(v_rate * v_nights, 2);
  v_tax numeric(5,2);
  v_services jsonb := '[]'::jsonb;
  v_services_total numeric(15,2) := 0;
  v_item jsonb;
  v_svc record;
  v_line_total numeric(15,2);
begin
  if v_nights <= 0 then raise exception 'INVALID_DATES'; end if;

  select rate_percent into v_tax from tax_rates
  where tenant_id = hz_current_tenant_id() order by is_default desc limit 1;

  for v_item in select jsonb_array_elements(p_services) loop
    select * into v_svc from services where id = (v_item->>'service_id')::uuid;
    if found then
      v_line_total := round(v_svc.price * least(coalesce((v_item->>'quantity')::int, 1), 1000), 2);
      v_services := v_services || jsonb_build_object(
        'label', v_svc.name, 'quantity', (v_item->>'quantity')::int,
        'unit_price', v_svc.price, 'total', v_line_total);
      v_services_total := v_services_total + v_line_total;
    end if;
  end loop;

  return jsonb_build_object(
    'room_type_id', p_room_type_id, 'room_id', p_room_id,
    'nights', v_nights, 'nightly_rate', v_rate, 'room_total', v_room_total,
    'tax_percent', v_tax, 'tax_total', round((v_room_total + v_services_total) * v_tax / 100, 2),
    'services', v_services,
    'total', round((v_room_total + v_services_total) * (1 + v_tax / 100), 2));
end $$;

-- ATOMIC reservation creation (spec §10, §18): N concurrent callers → 1 winner.
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
  p_services jsonb default '[]'
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
    check_in_date, check_out_date, adults, children, notes,
    total_amount, currency, source
  ) values (
    v_tenant, p_property_id, p_customer_id,
    'HZ-' || to_char(p_check_in, 'YYYY') || '-' || lpad(v_seq::text, 4, '0'),
    'CONFIRMED', p_check_in, p_check_out, p_adults, p_children, p_notes,
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

-- Controlled status transitions (state machine, spec §10).
create or replace function update_reservation_status(
  p_reservation_id uuid,
  p_to_status reservation_status,
  p_reason text default null
) returns reservations
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_res reservations;
begin
  select * into v_res from reservations
  where id = p_reservation_id and tenant_id = v_tenant for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002'; end if;

  if not (
       (v_res.status = 'DRAFT'      and p_to_status in ('PENDING','CONFIRMED','CANCELLED'))
    or (v_res.status = 'PENDING'    and p_to_status in ('CONFIRMED','CANCELLED','NO_SHOW'))
    or (v_res.status = 'CONFIRMED'  and p_to_status in ('CHECKED_IN','CANCELLED','NO_SHOW'))
    or (v_res.status = 'CHECKED_IN' and p_to_status = 'CHECKED_OUT')
  ) then
    raise exception 'INVALID_TRANSITION: % → %', v_res.status, p_to_status using errcode = '22023';
  end if;

  update reservations set status = p_to_status where id = v_res.id returning * into v_res;

  insert into reservation_status_history (tenant_id, reservation_id, from_status, to_status, changed_by, reason)
  values (v_tenant, v_res.id, null, p_to_status, auth.uid(), p_reason);

  perform hz_emit_event('reservation.' || lower(replace(p_to_status::text, '_', '_')),
                        jsonb_build_object('reservation_id', v_res.id, 'reference', v_res.reference));
  perform hz_audit('reservation.status_changed', 'reservations', v_res.id,
                   jsonb_build_object('status', v_res.status), jsonb_build_object('status', p_to_status));
  return v_res;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040016_reservation_functions');
