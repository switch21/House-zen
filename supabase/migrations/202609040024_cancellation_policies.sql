-- ============================================================================
-- HOUSE-ZEN — 202609040024_cancellation_policies.sql (PHASE 6)
-- ============================================================================
create table cancellation_policies (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references tenants(id) on delete cascade,
  name                    text not null,
  free_cancellation_hours int not null default 24 check (free_cancellation_hours between 0 and 720),
  penalty_percent         numeric(5,2) not null default 0 check (penalty_percent between 0 and 100),
  created_at              timestamptz not null default now()
);
create index cancellation_policies_tenant_idx on cancellation_policies(tenant_id);

select hz_tenant_rls('cancellation_policies');
