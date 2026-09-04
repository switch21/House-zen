-- ============================================================================
-- HOUSE-ZEN — 202609040031_expense_categories.sql (PHASE 6)
-- ============================================================================
create table expense_categories (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);
create index expense_categories_tenant_idx on expense_categories(tenant_id);

select hz_tenant_rls('expense_categories');

-- Deferred FK from 030.
alter table expenses
  add constraint expenses_category_fk
  foreign key (category_id) references expense_categories(id) on delete set null;
