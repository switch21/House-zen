-- ============================================================================
-- HOUSE-ZEN — 202609040025_invoices.sql (PHASE 6, spec §14)
-- DRAFT → ISSUED → PARTIALLY_PAID → PAID; VOID possible (never on PAID).
-- An ISSUED invoice is historically immutable: line items are frozen by trigger.
-- ============================================================================
create table invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references tenants(id) on delete cascade,
  reservation_id uuid references reservations(id) on delete set null,
  number         text not null unique,
  status         invoice_status not null default 'DRAFT',
  subtotal       numeric(15,2) not null default 0,
  tax_total      numeric(15,2) not null default 0,
  total          numeric(15,2) not null default 0,
  amount_paid    numeric(15,2) not null default 0,
  currency       char(3) not null default 'XAF',
  issued_at      timestamptz,
  voided_at      timestamptz,
  created_at     timestamptz not null default now()
);
create index invoices_tenant_idx on invoices(tenant_id, status);
create index invoices_res_idx    on invoices(reservation_id);

select hz_tenant_rls('invoices');

-- Immutability guard (spec §14): no UPDATE may change money columns once issued.
create or replace function hz_invoice_immutable_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status in ('ISSUED','PARTIALLY_PAID','PAID') then
    if new.subtotal <> old.subtotal or new.tax_total <> old.tax_total
       or new.total <> old.total or new.reservation_id is distinct from old.reservation_id then
      raise exception 'INVOICE_IMMUTABLE: void + reissue required' using errcode = '23514';
    end if;
    -- amount_paid & status may move via record_payment only.
    if new.amount_paid <> old.amount_paid and current_setting('hz.payment_context', true) is distinct from 'on' then
      raise exception 'INVOICE_IMMUTABLE: use record_payment' using errcode = '23514';
    end if;
  end if;
  return new;
end $$;

create trigger invoices_guard before update on invoices
  for each row execute function hz_invoice_immutable_guard();
