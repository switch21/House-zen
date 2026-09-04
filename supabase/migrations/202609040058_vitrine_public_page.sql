-- ============================================================================
-- HOUSE-ZEN — 202609040058_vitrine_public_page.sql
-- Page vitrine publique par établissement (tenant) :
--   1. Médias : properties.description/photos + room_types.photos
--   2. public_property_details v2 : description, photos, contacts, kind, photos
--   3. public_create_booking : réservation anonyme ATOMIQUE (le RPC faisait
--      défaut → 404 au clic final). Idempotence via reservations.idempotency_key
--      (reservation_guests.id_document étant chiffré, il n'est PAS recherchable).
--   4. Réutilise LE moteur de disponibilité existant (hz_nightly_rate, règles
--      d'overlap spec §10) — jamais de recalcul côté navigateur.
-- Idempotent.
-- ============================================================================

-- -------------------------------------------------------------- 1. médias ---
alter table properties add column if not exists description text not null default '';
alter table properties add column if not exists photos      text[] not null default '{}';
alter table room_types  add column if not exists photos      text[] not null default '{}';

-- ------------------------------------------------- 2. détail public (vitrine) --
create or replace function public_property_details(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'name', pr.name, 'slug', pr.slug,
    'city', pr.city, 'country', pr.country, 'currency', t.currency,
    'description', pr.description,
    'photos', to_jsonb(pr.photos),
    'phone', pr.phone, 'email', pr.email,
    'room_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rt.id, 'name', rt.name, 'description', rt.description,
        'kind', rt.kind, 'photos', to_jsonb(rt.photos),
        'base_price', rt.base_price, 'max_occupancy', rt.max_occupancy)), '[]')
      from room_types rt where rt.property_id = pr.id))
  from properties pr
  join tenants t on t.id = pr.tenant_id
  where pr.slug = p_slug and pr.is_published = true;
$$;

-- ------------------------------------------- 3. réservation publique (anon) --
-- Colonne d'idempotence dédiée (unique partielle).
alter table reservations add column if not exists idempotency_key text;
create unique index if not exists reservations_idempotency_key_idx
  on reservations(idempotency_key) where idempotency_key is not null;

create or replace function public_create_booking(
  p_slug            text,
  p_room_type_id    uuid,
  p_check_in        date,
  p_check_out       date,
  p_adults          int,
  p_children        int,
  p_guest           jsonb,
  p_idempotency_key text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_property  properties;
  v_tenant    uuid;
  v_room      rooms;
  v_customer  customers;
  v_res       reservations;
  v_rate      numeric(15,2);
  v_nights    int;
  v_room_total numeric(15,2);
  v_tax       numeric(5,2);
  v_total     numeric(15,2);
  v_seq       bigint;
  v_email     text;
begin
  -- (a) Rejeu idempotent : même clé → même réservation.
  if coalesce(p_idempotency_key, '') <> '' then
    select * into v_res from reservations
    where idempotency_key = p_idempotency_key limit 1;
    if found then
      return jsonb_build_object('reference', v_res.reference,
        'reservation_id', v_res.id, 'total', v_res.total_amount);
    end if;
  end if;

  -- (b) Établissement publié uniquement.
  select * into v_property from properties
  where slug = p_slug and is_published = true;
  if not found then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_tenant := v_property.tenant_id;

  -- (c) Validation des entrées.
  if p_check_out <= p_check_in then
    raise exception 'INVALID_DATES' using errcode = '22023';
  end if;
  if p_adults < 1 or p_adults > 8 then
    raise exception 'INVALID_ADULTS' using errcode = '22023';
  end if;
  v_email := nullif(trim(coalesce(p_guest->>'email', '')), '');
  if coalesce(p_guest->>'full_name', '') = '' or v_email is null
     or coalesce(p_guest->>'phone', '') = '' then
    raise exception 'INVALID_GUEST' using errcode = '22023';
  end if;

  -- (d) Le type de chambre appartient bien à CET établissement + capacité.
  if not exists (select 1 from room_types rt
                 where rt.id = p_room_type_id and rt.property_id = v_property.id) then
    raise exception 'ROOM_TYPE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if (select max_occupancy from room_types where id = p_room_type_id) < p_adults then
    raise exception 'INVALID_OCCUPANCY' using errcode = '22023';
  end if;

  -- (e) Verrou d'une chambre libre (sérialisation → zéro surbooking).
  select r.* into v_room
  from rooms r
  where r.property_id = v_property.id
    and r.room_type_id = p_room_type_id
    and r.status = 'OPERATIONAL'
    and not exists (
      select 1 from reservation_items ri
      join reservations res on res.id = ri.reservation_id
      where ri.room_id = r.id
        and res.status in ('PENDING', 'CONFIRMED', 'CHECKED_IN')
        and p_check_in  < res.check_out_date
        and p_check_out > res.check_in_date)
  order by r.room_number
  limit 1
  for update;
  if not found then
    raise exception 'ROOM_UNAVAILABLE' using errcode = '23514';
  end if;

  -- (f) Tarification : LE moteur unique (taux saison + tarif actif).
  v_rate       := hz_nightly_rate(p_room_type_id, p_check_in);
  v_nights     := (p_check_out - p_check_in);
  v_room_total := round(v_rate * v_nights, 2);
  select rate_percent into v_tax from tax_rates
  where tenant_id = v_tenant order by is_default desc limit 1;
  v_tax   := coalesce(v_tax, 0);
  v_total := round(v_room_total * (1 + v_tax / 100.0), 2);

  -- (g) Client léger : réutilise l'email au sein du bon tenant.
  select * into v_customer from customers
  where tenant_id = v_tenant and email = v_email
  order by created_at
  limit 1
  for update;
  if not found then
    insert into customers (tenant_id, full_name, email, phone, country)
    values (v_tenant,
            p_guest->>'full_name',
            v_email,
            p_guest->>'phone',
            nullif(trim(coalesce(p_guest->>'country', '')), ''))
    returning * into v_customer;
  end if;

  -- (h) Réservation + items + hôte principal + historique + événement.
  insert into hz_counters(tenant_id) values (v_tenant)
  on conflict (tenant_id) do nothing;
  update hz_counters set reservation = reservation + 1
  where tenant_id = v_tenant returning reservation into v_seq;

  insert into reservations (
    tenant_id, property_id, customer_id, reference, status,
    check_in_date, check_out_date, adults, children, notes,
    total_amount, currency, source, idempotency_key
  ) values (
    v_tenant, v_property.id, v_customer.id,
    'HZ-' || to_char(p_check_in, 'YYYY') || '-' || lpad(v_seq::text, 4, '0'),
    'CONFIRMED', p_check_in, p_check_out, p_adults, coalesce(p_children, 0),
    'Réservation en ligne', v_total,
    (select currency from tenants where id = v_tenant),
    'PUBLIC_WIDGET', nullif(p_idempotency_key, '')
  ) returning * into v_res;

  insert into reservation_items (tenant_id, reservation_id, room_id, room_type_id, nightly_rate)
  values (v_tenant, v_res.id, v_room.id, p_room_type_id, v_rate);

  insert into reservation_guests (tenant_id, reservation_id, full_name, is_primary)
  values (v_tenant, v_res.id, p_guest->>'full_name', true);

  insert into reservation_status_history (tenant_id, reservation_id, from_status, to_status)
  values (v_tenant, v_res.id, null, 'CONFIRMED');

  perform hz_emit_event('reservation.created', jsonb_build_object(
    'reservation_id', v_res.id, 'reference', v_res.reference,
    'total', v_res.total_amount, 'source', 'PUBLIC_WIDGET'));

  return jsonb_build_object('reference', v_res.reference,
    'reservation_id', v_res.id, 'total', v_res.total_amount);
end $$;

revoke execute on function public_create_booking(text, uuid, date, date, int, int, jsonb, text) from public;
grant  execute on function public_create_booking(text, uuid, date, date, int, int, jsonb, text) to anon, authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609040058_vitrine_public_page')
on conflict (key, value) do nothing;
