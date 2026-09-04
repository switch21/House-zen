-- ============================================================================
-- HOUSE-ZEN — 202609040036_api_keys.sql (PHASE 8)
-- API keys with scopes; only a SHA-256 hash is stored (never the raw key).
-- ============================================================================
create table api_keys (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) on delete cascade,
  name         text not null,
  key_hash     text not null unique,      -- sha256(key), raw key shown once
  prefix       text not null,             -- first 8 chars for lookup/identification
  scopes       text[] not null default '{read}',
  last_used_at timestamptz,
  revoked_at   timestamptz,
  created_at   timestamptz not null default now()
);
create index api_keys_tenant_idx on api_keys(tenant_id);

alter table api_keys enable row level security;
create policy api_keys_owner_read on api_keys
  for select using (tenant_id = hz_current_tenant_id() and hz_has_permission(tenant_id, 'settings.read'));
create policy api_keys_owner_write on api_keys
  for all using (tenant_id = hz_current_tenant_id() and hz_has_permission(tenant_id, 'settings.write'))
  with check (tenant_id = hz_current_tenant_id() and hz_has_permission(tenant_id, 'settings.write'));

create or replace function hz_verify_api_key(p_raw_key text)
returns api_keys
language sql stable security definer set search_path = public, extensions as $$
  select k.* from api_keys k
  where k.prefix = left(p_raw_key, 8)
    and k.key_hash = encode(digest(p_raw_key, 'sha256'), 'hex')
    and k.revoked_at is null;
$$;
