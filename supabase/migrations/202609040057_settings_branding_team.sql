-- ============================================================================
-- HOUSE-ZEN — 202609040057_settings_branding_team.sql (PHASE 14 — SETTINGS)
--
-- 1. Establishment branding on tenants: address / contacts / tax ids / logo
--    (logo is rendered in the header of printable documents: invoices…).
-- 2. FUNCTIONAL FIX taxes + cancellation policies: their *_tenant_write
--    policies required hz_has_permission('tax_rates.write') /
--    ('cancellation_policies.write') — permissions that DO NOT EXIST in the
--    matrix (spec §6). Every INSERT therefore failed with 42501 for every
--    role, owner included. These settings belong to the 'settings.write'
--    permission (owner + manager), matching the RBAC matrix and the UI.
-- 3. Team directory RPC: profiles RLS intentionally exposes only the caller's
--    own row, so the Team page could only show raw user_id UUIDs.
--    hz_team_directory() (SECURITY DEFINER, gated on team.read) returns the
--    tenant's memberships joined with profiles (email + full name).
-- 4. Storage bucket 'branding' (public read) for establishment logos:
--    uploads rooted at <tenant_id>/… and gated on settings.write.
-- 5. tenants_update now also accepts settings.write holders (manager), matching
--    the UI (writeAllowed = owner || manager). Owner/super admin unchanged.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Establishment branding columns
-- ---------------------------------------------------------------------------
alter table tenants
  add column if not exists address_line        text,
  add column if not exists city                text,
  add column if not exists country             text,
  add column if not exists phone               text,
  add column if not exists contact_email       text,
  add column if not exists website             text,
  add column if not exists tax_id              text,
  add column if not exists registration_no     text,
  add column if not exists logo_url            text,
  add column if not exists default_check_in_time  time not null default '14:00',
  add column if not exists default_check_out_time time not null default '12:00';

comment on column tenants.tax_id is 'Numéro d''identifiant fiscal (NIU) — printed on documents';
comment on column tenants.registration_no is 'Registre de commerce (RCCM) — printed on documents';
comment on column tenants.logo_url is 'Public URL of the establishment logo (storage bucket branding) — document header';

-- ---------------------------------------------------------------------------
-- 2. FUNCTIONAL FIX: taxes & cancellation policies writable again
--    (owner + manager via settings.write — permissions that actually exist)
-- ---------------------------------------------------------------------------
drop policy if exists tax_rates_tenant_write on tax_rates;
create policy tax_rates_tenant_write on tax_rates
  for all
  using (
    tenant_id = hz_current_tenant_id()
    and hz_has_permission(tenant_id, 'settings.write')
  )
  with check (
    tenant_id = hz_current_tenant_id()
    and hz_has_permission(tenant_id, 'settings.write')
  );

drop policy if exists cancellation_policies_tenant_write on cancellation_policies;
create policy cancellation_policies_tenant_write on cancellation_policies
  for all
  using (
    tenant_id = hz_current_tenant_id()
    and hz_has_permission(tenant_id, 'settings.write')
  )
  with check (
    tenant_id = hz_current_tenant_id()
    and hz_has_permission(tenant_id, 'settings.write')
  );

-- ---------------------------------------------------------------------------
-- 3. Team directory: memberships + profiles for the caller's tenant
-- ---------------------------------------------------------------------------
create or replace function hz_team_directory()
returns table (
  membership_id uuid,
  user_id       uuid,
  email         text,
  full_name     text,
  role          user_role,
  joined_at     timestamptz
)
language sql stable security definer set search_path = public as $$
  select m.id, m.user_id, p.email::text, p.full_name, m.role, m.created_at
  from memberships m
  join profiles p on p.id = m.user_id
  where m.tenant_id = hz_current_tenant_id()
    and hz_has_permission(hz_current_tenant_id(), 'team.read')
$$;

revoke execute on function hz_team_directory() from public, anon;
grant execute on function hz_team_directory() to authenticated;

-- Tenant id of the caller (used client-side to build the branding upload path).
create or replace function hz_current_tenant()
returns uuid
language sql stable security definer set search_path = public as $$
  select hz_current_tenant_id()
$$;

revoke execute on function hz_current_tenant() from public, anon;
grant execute on function hz_current_tenant() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Branding storage bucket (public read, settings.write-gated writes)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'branding', 'branding', true, 2097152,
  array['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists branding_select on storage.objects;
create policy branding_select on storage.objects
  for select using (bucket_id = 'branding');

drop policy if exists branding_insert on storage.objects;
create policy branding_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'branding'
    and hz_has_permission(((storage.foldername(name))[1])::uuid, 'settings.write')
  );

drop policy if exists branding_delete on storage.objects;
create policy branding_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'branding'
    and hz_has_permission(((storage.foldername(name))[1])::uuid, 'settings.write')
  );

-- ---------------------------------------------------------------------------
-- 5. tenants_update: owner / super admin / settings.write holders (manager)
-- ---------------------------------------------------------------------------
drop policy if exists tenants_update on tenants;
create policy tenants_update on tenants
  for update
  using (
    hz_role_in_tenant(id) = 'owner'
    or hz_has_permission(id, 'settings.write')
    or hz_is_super_admin()
  );

delete from hz_schema_meta where key = 'migration';
insert into hz_schema_meta(key, value) values ('migration', '202609040057_settings_branding_team');
