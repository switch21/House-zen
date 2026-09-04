-- ============================================================================
-- HOUSE-ZEN — 202609040027_payments.sql (PHASE 6, spec §15)
-- Methods: CASH/MOBILE_MONEY/CARD/BANK_TRANSFER/OTHER. Idempotency key unique.
-- ============================================================================
create table payments (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references tenants(id) on delete cascade,
  invoice_id        uuid references invoices(id) on delete set null,
  reservation_id    uuid references reservations(id) on delete set null,
  amount            numeric(15,2) not null check (amount > 0),
  currency          char(3) not null default 'XAF',
  method            payment_method not null,
  status            payment_status not null default 'SUCCEEDED',
  idempotency_key   text,
  provider_reference text,
  created_at        timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);
create index payments_tenant_idx on payments(tenant_id, status);
create index payments_invoice_idx on payments(invoice_id);

select hz_tenant_rls('payments');
