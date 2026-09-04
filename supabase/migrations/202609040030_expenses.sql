-- ============================================================================
-- HOUSE-ZEN — 202609040030_expenses.sql (PHASE 6)
-- FK to expense_categories/suppliers are added in 031/032 (table order).
-- ============================================================================
create table expenses (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  category_id uuid,
  supplier_id uuid,
  property_id uuid references properties(id) on delete set null,
  label       text not null,
  amount      numeric(15,2) not null check (amount > 0),
  currency    char(3) not null default 'XAF',
  spent_at    date not null default current_date,
  created_at  timestamptz not null default now()
);
create index expenses_tenant_idx on expenses(tenant_id, spent_at);

select hz_tenant_rls('expenses');
