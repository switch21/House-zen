-- ============================================================================
-- HOUSE-ZEN — 202609040028_payment_allocations.sql (PHASE 6)
-- A payment is allocated across invoices; allocations are append-only.
-- ============================================================================
create table payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  payment_id uuid not null references payments(id) on delete cascade,
  invoice_id uuid not null references invoices(id) on delete restrict,
  amount     numeric(15,2) not null check (amount > 0),
  created_at timestamptz not null default now()
);
create index payment_allocations_payment_idx on payment_allocations(payment_id);
create index payment_allocations_invoice_idx on payment_allocations(invoice_id);

select hz_tenant_rls('payment_allocations');
