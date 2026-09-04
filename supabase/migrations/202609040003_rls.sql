-- ============================================================================
-- HOUSE-ZEN — 202609040003_rls.sql
-- Global RLS: tenants/profiles/memberships/audit_logs/domain_events + helpers
-- applied to every business table created later via hz_tenant_rls().
-- ============================================================================

alter table tenants      enable row level security;
alter table profiles     enable row level security;
alter table memberships  enable row level security;
alter table audit_logs   enable row level security;
alter table domain_events enable row level security;

-- Tenants: readable by members; mutated by owner only (name/currency/locale).
create policy tenants_read on tenants
  for select using (
    id = hz_current_tenant_id() or hz_is_super_admin()
  );
create policy tenants_update on tenants
  for update using (hz_role_in_tenant(id) = 'owner' or hz_is_super_admin());

-- Profiles: self read/update; super admin read.
create policy profiles_read on profiles
  for select using (id = auth.uid() or hz_is_super_admin());
create policy profiles_update on profiles
  for update using (id = auth.uid());
create policy profiles_insert on profiles
  for insert with check (id = auth.uid());

-- Memberships: members see the team; owner manages it (spec §6).
create policy memberships_read on memberships
  for select using (
    tenant_id = hz_current_tenant_id()
    or user_id = auth.uid()
    or hz_is_super_admin()
  );
create policy memberships_write on memberships
  for all using (hz_role_in_tenant(tenant_id) = 'owner' or hz_is_super_admin())
  with check (hz_role_in_tenant(tenant_id) = 'owner' or hz_is_super_admin());

-- Audit logs: append-only, tenant-scoped read; no update/delete policies at all.
create policy audit_read on audit_logs
  for select using (tenant_id = hz_current_tenant_id() or hz_is_super_admin());
create policy audit_insert on audit_logs
  for insert with check (tenant_id = hz_current_tenant_id() or hz_is_super_admin());

-- Domain events: engine-internal; tenant read only.
create policy domain_events_read on domain_events
  for select using (tenant_id = hz_current_tenant_id());

-- ---------------------------------------------------------------------------
-- Helper to attach the standard tenant isolation to any business table.
-- Usage in later migrations: select hz_tenant_rls('rooms');
-- ---------------------------------------------------------------------------
create or replace function hz_tenant_rls(p_table text)
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
    p_table, p_table, p_table, p_table);
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040003_rls');
