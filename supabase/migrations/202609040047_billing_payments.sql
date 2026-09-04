-- ============================================================================
-- HOUSE-ZEN — 202609040047_billing_payments.sql (PHASE 12)
-- SaaS-side payment records from provider webhooks (Stripe etc.).
-- ============================================================================
create table billing_payments (
  id             uuid primary key default gen_random_uuid(),
  billing_invoice_id uuid not null references billing_invoices(id) on delete cascade,
  tenant_id      uuid not null references tenants(id) on delete cascade,
  amount         numeric(15,2) not null,
  currency       char(3) not null default 'XAF',
  provider       text not null default 'stripe',
  provider_ref   text not null unique,   -- idempotency at provider level
  status         text not null default 'SUCCEEDED',
  created_at     timestamptz not null default now()
);

alter table billing_payments enable row level security;
create policy billing_payments_read on billing_payments
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());
