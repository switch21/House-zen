-- ============================================================================
-- HOUSE-ZEN — 202609220068_fix_tenant_write_permissions.sql
-- ROOT CAUSE (user-reported: "maintenance_tickets: new row violates row-level
-- security policy"): hz_tenant_rls() generated the write policy permission
-- from the TABLE NAME (`%s.write` = '<table>.write'), which only matches the
-- RBAC matrix for single-word tables (rooms.write, invoices.write...).
-- Multi-word tables got impossible permissions that NO role holds:
--   housekeeping_tasks.write, maintenance_tickets.write,
--   expense_categories.write, checkins.write, payment_allocations.write, …
-- → every INSERT/UPDATE/DELETE through the generic CRUD adapter failed RLS.
-- Fix: hz_tenant_rls gains an explicit p_permission argument (defaults to the
-- table name = previous behaviour), then re-applies the correct policy per
-- multi-word table. USING clause is fixed too (it also broke UPDATE/DELETE).
-- ============================================================================

create or replace function hz_tenant_rls(p_table text, p_permission text default null)
returns void
language plpgsql security definer set search_path = public as $$
begin
  execute format('alter table %I enable row level security;', p_table);
  execute format('drop policy if exists %I_tenant_select on %I;', p_table, p_table);
  execute format('create policy %I_tenant_select on %I for select using (tenant_id = hz_current_tenant_id());', p_table, p_table);
  execute format('drop policy if exists %I_tenant_write on %I;', p_table, p_table);
  execute format($f$create policy %I_tenant_write on %I for all
    using (tenant_id = hz_current_tenant_id() and hz_has_permission(tenant_id, '%s.write'))
    with check (tenant_id = hz_current_tenant_id() and hz_has_permission(tenant_id, '%s.write'));$f$,
    p_table, p_table, coalesce(p_permission, p_table), coalesce(p_permission, p_table));
end $$;

-- Re-apply with the permission key that actually exists in the RBAC matrix
-- (hz_has_permission, migration 0002) — idempotent, restores UPDATE/DELETE too.
select hz_tenant_rls('housekeeping_tasks',    'housekeeping');
select hz_tenant_rls('housekeeping_logs',     'housekeeping');
select hz_tenant_rls('maintenance_tickets',   'maintenance');
select hz_tenant_rls('maintenance_logs',      'maintenance');
select hz_tenant_rls('expense_categories',    'expenses');
select hz_tenant_rls('service_orders',        'services');
select hz_tenant_rls('reservation_guests',    'reservations');
select hz_tenant_rls('reservation_items',     'reservations');
select hz_tenant_rls('checkins',              'reservations');
select hz_tenant_rls('checkouts',             'reservations');
select hz_tenant_rls('rate_seasons',          'rates');
select hz_tenant_rls('rate_rules',            'rates');
select hz_tenant_rls('invoice_items',         'invoices');
select hz_tenant_rls('payment_allocations',   'payments');
select hz_tenant_rls('room_amenities',        'rooms');
select hz_tenant_rls('notification_templates','settings');
select hz_tenant_rls('notification_deliveries','settings');

-- Recreate the default-tenant BEFORE INSERT trigger on every table that has a
-- *_tenant_write policy (cheap idempotent sweep — guards future re-applies).
do $apply$
declare t text;
begin
  for t in
    select distinct tablename from pg_policies
    where schemaname = 'public' and policyname like '%\_tenant\_write'
  loop
    execute format('drop trigger if exists trg_%s_default_tenant on %I;', t, t);
    execute format('create trigger trg_%s_default_tenant before insert on %I
       for each row execute function hz_default_tenant_id();', t, t);
  end loop;
end;
$apply$;

insert into hz_schema_meta(key, value) values ('migration', '202609220068_fix_tenant_write_permissions')
on conflict do nothing;
