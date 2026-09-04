-- ============================================================================
-- HOUSE-ZEN — 202609040033_finance_functions.sql (PHASE 6, spec §14/§15)
-- Invoice lifecycle (immutable once issued) + idempotent payment recording.
-- ============================================================================
create or replace function create_invoice_from_reservation(p_reservation_id uuid)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_res reservations;
  v_invoice_id uuid;
  v_seq bigint;
  v_subtotal numeric(15,2);
  v_room_total numeric(15,2);
  v_services_total numeric(15,2) := 0;
  v_tax numeric(5,2);
  v_nights int;
  v_rate numeric(15,2);
begin
  if not hz_has_permission(v_tenant, 'invoices.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;

  select * into v_res from reservations
  where id = p_reservation_id and tenant_id = v_tenant for update;
  if not found then raise exception 'RESERVATION_NOT_FOUND'; end if;

  if exists (select 1 from invoices where reservation_id = v_res.id and status <> 'VOID') then
    raise exception 'INVOICE_EXISTS' using errcode = '23514';
  end if;

  select nightly_rate into v_rate from reservation_items
  where reservation_id = v_res.id limit 1;
  select (v_res.check_out_date - v_res.check_in_date) into v_nights;
  v_room_total := round(coalesce(v_rate, 0) * v_nights, 2);

  select coalesce(sum(total), 0) into v_services_total from service_orders
  where reservation_id = v_res.id;

  v_subtotal := v_room_total + v_services_total;
  select rate_percent into v_tax from tax_rates
  where tenant_id = v_tenant order by is_default desc limit 1;

  insert into hz_counters(tenant_id) values (v_tenant) on conflict (tenant_id) do nothing;
  update hz_counters set invoice = invoice + 1 where tenant_id = v_tenant returning invoice into v_seq;

  insert into invoices (tenant_id, reservation_id, number, status, subtotal, tax_total, total, currency)
  values (v_tenant, v_res.id,
          'FA-' || to_char(now(), 'YYYY') || '-' || lpad(v_seq::text, 4, '0'),
          'DRAFT', v_subtotal,
          round(v_subtotal * coalesce(v_tax, 0) / 100, 2),
          round(v_subtotal * (1 + coalesce(v_tax, 0) / 100), 2),
          v_res.currency)
  returning id into v_invoice_id;

  insert into invoice_items (tenant_id, invoice_id, description, quantity, unit_price, total)
  values (v_tenant, v_invoice_id,
          'Séjour (' || v_nights || ' nuit(s))', 1, v_room_total, v_room_total);

  insert into invoice_items (tenant_id, invoice_id, description, quantity, unit_price, total)
  select v_tenant, v_invoice_id, 'Service — ' || so.service_name, so.quantity, so.unit_price, so.total
  from service_orders so where so.reservation_id = v_res.id;

  perform hz_audit('invoice.created', 'invoices', v_invoice_id, null, null);
  return v_invoice_id;
end $$;

create or replace function issue_invoice(p_invoice_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
begin
  if not hz_has_permission(v_tenant, 'invoices.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  update invoices set status = 'ISSUED', issued_at = now()
  where id = p_invoice_id and tenant_id = v_tenant and status = 'DRAFT';
  if not found then raise exception 'INVOICE_NOT_DRAFT' using errcode = '22023'; end if;
  perform hz_emit_event('invoice.issued', jsonb_build_object('invoice_id', p_invoice_id));
  perform hz_audit('invoice.issued', 'invoices', p_invoice_id, null, null);
end $$;

create or replace function void_invoice(p_invoice_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
begin
  if not hz_has_permission(v_tenant, 'invoices.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  update invoices set status = 'VOID', voided_at = now()
  where id = p_invoice_id and tenant_id = v_tenant
    and status in ('DRAFT','ISSUED','PARTIALLY_PAID');  -- PAID invoices: credit note path
  if not found then raise exception 'INVOICE_NOT_VOIDABLE' using errcode = '22023'; end if;
  perform hz_emit_event('invoice.voided', jsonb_build_object('invoice_id', p_invoice_id, 'reason', p_reason));
  perform hz_audit('invoice.voided', 'invoices', p_invoice_id, null, jsonb_build_object('reason', p_reason));
end $$;

-- Idempotent payment (spec §15): same idempotency_key → same payment returned.
create or replace function record_payment(
  p_invoice_id uuid,
  p_reservation_id uuid,
  p_amount numeric(15,2),
  p_method payment_method,
  p_idempotency_key text default null
) returns payments
language plpgsql security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_existing payments;
  v_payment payments;
  v_invoice invoices;
  v_paid numeric(15,2);
begin
  if not hz_has_permission(v_tenant, 'payments.write') then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  if p_amount <= 0 then raise exception 'INVALID_AMOUNT' using errcode = '22023'; end if;

  if p_idempotency_key is not null then
    select * into v_existing from payments
    where tenant_id = v_tenant and idempotency_key = p_idempotency_key;
    if found then return v_existing; end if;  -- idempotent replay → same result
  end if;

  insert into payments (tenant_id, invoice_id, reservation_id, amount, currency, method,
                        status, idempotency_key)
  values (v_tenant, p_invoice_id, p_reservation_id, p_amount,
          (select currency from tenants where id = v_tenant), p_method, 'SUCCEEDED',
          p_idempotency_key)
  returning * into v_payment;

  if p_invoice_id is not null then
    select * into v_invoice from invoices where id = p_invoice_id and tenant_id = v_tenant for update;
    if found then
      insert into payment_allocations (tenant_id, payment_id, invoice_id, amount)
      values (v_tenant, v_payment.id, v_invoice.id, p_amount);

      v_paid := v_invoice.amount_paid + p_amount;
      set local hz.payment_context = 'on';
      update invoices
      set amount_paid = v_paid,
          status = case
            when v_invoice.status = 'DRAFT' then v_invoice.status
            when v_paid >= v_invoice.total then 'PAID'
            else 'PARTIALLY_PAID' end
      where id = v_invoice.id;
      reset hz.payment_context;
    end if;
  end if;

  perform hz_emit_event('payment.succeeded',
    jsonb_build_object('payment_id', v_payment.id, 'amount', p_amount, 'method', p_method));
  perform hz_audit('payment.created', 'payments', v_payment.id, null, to_jsonb(v_payment));
  return v_payment;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040033_finance_functions');
