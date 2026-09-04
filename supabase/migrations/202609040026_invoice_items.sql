-- ============================================================================
-- HOUSE-ZEN — 202609040026_invoice_items.sql (PHASE 6)
-- ============================================================================
create table invoice_items (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  invoice_id  uuid not null references invoices(id) on delete cascade,
  description text not null,
  quantity    numeric(12,3) not null default 1 check (quantity > 0),
  unit_price  numeric(15,2) not null check (unit_price >= 0),
  total       numeric(15,2) not null check (total >= 0)
);
create index invoice_items_invoice_idx on invoice_items(invoice_id);

select hz_tenant_rls('invoice_items');

-- Items of an issued invoice are frozen (historical integrity, spec §14).
create or replace function hz_invoice_items_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_status invoice_status;
begin
  if tg_op = 'DELETE' then
    select status into v_status from invoices where id = old.invoice_id;
    if v_status in ('ISSUED','PARTIALLY_PAID','PAID') then
      raise exception 'INVOICE_IMMUTABLE' using errcode = '23514';
    end if;
    return old;
  end if;
  select status into v_status from invoices where id = new.invoice_id;
  if v_status in ('ISSUED','PARTIALLY_PAID','PAID') then
    raise exception 'INVOICE_IMMUTABLE' using errcode = '23514';
  end if;
  return new;
end $$;

create trigger invoice_items_guard before insert or update or delete on invoice_items
  for each row execute function hz_invoice_items_guard();
