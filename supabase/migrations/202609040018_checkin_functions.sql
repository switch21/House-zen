-- ============================================================================
-- HOUSE-ZEN — 202609040018_checkin_functions.sql (PHASE 5, spec §11)
-- perform_checkin / perform_checkout — atomic business operations.
-- Checkout enforces tenant financial policy on unpaid balances.
-- ============================================================================
create or replace function perform_checkin(p_reservation_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_res reservations;
  v_room_id uuid;
begin
  if not hz_has_permission(v_tenant, 'reservations.checkin') then
    raise exception 'PERMISSION_DENIED: reservations.checkin required' using errcode = '42501';
  end if;

  select * into v_res from reservations
  where id = p_reservation_id and tenant_id = v_tenant for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_res.status <> 'CONFIRMED' then
    raise exception 'INVALID_TRANSITION: % → CHECKED_IN', v_res.status using errcode = '22023';
  end if;

  select ri.room_id into v_room_id from reservation_items ri
  where ri.reservation_id = v_res.id limit 1;

  update reservations set status = 'CHECKED_IN' where id = v_res.id;
  insert into checkins (tenant_id, reservation_id, room_id, performed_by)
  values (v_tenant, v_res.id, v_room_id, auth.uid());

  -- Occupied room is dirty on departure by definition of usage; set for housekeeping.
  update rooms set housekeeping_state = 'DIRTY' where id = v_room_id;

  perform hz_emit_event('checkin.completed',
    jsonb_build_object('reservation_id', v_res.id, 'reference', v_res.reference));
  perform hz_audit('checkin.completed', 'reservations', v_res.id, null,
                   jsonb_build_object('room_id', v_room_id));
end $$;

create or replace function perform_checkout(p_reservation_id uuid, p_clear_balance boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_res reservations;
  v_invoice invoices;
  v_balance numeric(15,2);
  v_room_id uuid;
begin
  if not hz_has_permission(v_tenant, 'reservations.checkout') then
    raise exception 'PERMISSION_DENIED: reservations.checkout required' using errcode = '42501';
  end if;

  select * into v_res from reservations
  where id = p_reservation_id and tenant_id = v_tenant for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_res.status <> 'CHECKED_IN' then
    raise exception 'INVALID_TRANSITION: % → CHECKED_OUT', v_res.status using errcode = '22023';
  end if;

  select * into v_invoice from invoices
  where reservation_id = v_res.id and status <> 'VOID'
  order by created_at desc limit 1 for update;

  v_balance := coalesce(v_invoice.total, 0) - coalesce(v_invoice.amount_paid, 0);
  if v_balance > 0 and p_clear_balance = false then
    raise exception 'BALANCE_DUE: % remaining', v_balance using errcode = '23514';
  end if;

  select ri.room_id into v_room_id from reservation_items ri
  where ri.reservation_id = v_res.id limit 1;

  update reservations set status = 'CHECKED_OUT' where id = v_res.id;
  insert into checkouts (tenant_id, reservation_id, room_id, balance_due, balance_cleared, performed_by)
  values (v_tenant, v_res.id, v_room_id, v_balance, v_balance <= 0 or p_clear_balance, auth.uid());

  -- Room leaves to housekeeping, never to availability directly (spec §12).
  update rooms set housekeeping_state = 'DIRTY' where id = v_room_id;

  perform hz_emit_event('checkout.completed',
    jsonb_build_object('reservation_id', v_res.id, 'reference', v_res.reference));
  perform hz_audit('checkout.completed', 'reservations', v_res.id, null,
                   jsonb_build_object('balance_due', v_balance, 'cleared', p_clear_balance));

  return jsonb_build_object('balance_due', v_balance, 'cleared', v_balance <= 0 or p_clear_balance);
end $$;


insert into hz_schema_meta(key, value) values ('migration', '202609040018_checkin_functions');
-- NOTE: checkouts table is created in 202609040019_checkouts.sql (FK ordering).
