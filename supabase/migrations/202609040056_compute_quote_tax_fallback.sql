-- ============================================================================
-- HOUSE-ZEN — 202609040056_compute_quote_tax_fallback.sql
-- HOTFIX (production): a tenant WITHOUT any tax_rates row made compute_quote
-- return NULL tax/total (v_tax NULL propagates through round() and
-- jsonb_build_object), so create_reservation_atomic failed with
-- "null value in column total_amount violates not-null constraint".
-- Fix: coalesce the default tax rate to 0 and fail loudly when the room type
-- cannot be priced (instead of silently pricing NULL).
-- Semantics otherwise unchanged — full body re-applied.
-- ============================================================================

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
  v_room_total numeric(15,2);
  v_tax numeric(5,2) := 0;
  v_services jsonb := '[]'::jsonb;
  v_services_total numeric(15,2) := 0;
  v_item jsonb;
  v_svc record;
  v_line_total numeric(15,2);
begin
  if v_nights <= 0 then raise exception 'INVALID_DATES'; end if;

  -- Loud failure instead of a NULL-priced quote (HZ-2026-0001 incident).
  if v_rate is null then
    raise exception 'ROOM_TYPE_NOT_FOUND: cannot resolve nightly rate'
      using errcode = 'P0002';
  end if;
  v_room_total := round(v_rate * v_nights, 2);

  -- Tenants may not have configured any tax rate yet → default 0%.
  select coalesce(rate_percent, 0) into v_tax from tax_rates
  where tenant_id = hz_current_tenant_id() order by is_default desc limit 1;
  v_tax := coalesce(v_tax, 0);

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

insert into hz_schema_meta(key, value) values ('migration', '202609040056_compute_quote_tax_fallback');
