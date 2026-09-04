-- ============================================================================
-- HOUSE-ZEN — 202609040043_usage.sql (PHASE 12)
-- Counters/metrics instead of costly COUNT(*) at read time (spec §19).
-- ============================================================================
create table usage (
  tenant_id  uuid not null references tenants(id) on delete cascade,
  metric     text not null,
  value      bigint not null default 0,
  period     text not null default to_char(now(), 'YYYY-MM'),
  updated_at timestamptz not null default now(),
  primary key (tenant_id, metric, period)
);

alter table usage enable row level security;
create policy usage_read on usage
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());

-- Periodic recompute (called by cron/Edge Function; cheap set-based updates).
create or replace function hz_recompute_usage()
returns void
language sql security definer set search_path = public as $$
  insert into usage (tenant_id, metric, value)
  select t.id, 'reservations', count(r.id) from tenants t
    left join reservations r on r.tenant_id = t.id group by t.id
  on conflict (tenant_id, metric, period)
  do update set value = excluded.value, updated_at = now();
$$;
