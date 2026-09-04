-- ============================================================================
-- HOUSE-ZEN — 202609040044_feature_flags.sql (PHASE 12)
-- Platform-wide and per-tenant flags toggled from Super Admin (audited).
-- ============================================================================
create table feature_flags (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references tenants(id) on delete cascade, -- null = global
  key        text not null,
  enabled    boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (tenant_id, key)
);

alter table feature_flags enable row level security;
create policy feature_flags_read on feature_flags
  for select using (hz_is_super_admin() or tenant_id is null or tenant_id = hz_current_tenant_id());

create or replace function admin_toggle_feature_flag(p_flag_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  update feature_flags set enabled = not enabled, updated_at = now() where id = p_flag_id;
  perform hz_audit('admin.feature_flag_toggled', 'feature_flags', p_flag_id, null, null);
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040044_feature_flags');
