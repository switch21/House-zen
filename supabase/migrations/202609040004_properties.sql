-- ============================================================================
-- HOUSE-ZEN — 202609040004_properties.sql  (PHASE 3)
-- ============================================================================
create table properties (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  name          text not null check (char_length(name) between 2 and 120),
  slug          text not null,
  property_type property_type not null default 'HOTEL',
  address       text not null default '',
  city          text not null default '',
  country       text not null default '',
  phone         text not null default '',
  email         text not null default '',
  timezone      text not null default 'Africa/Douala',
  is_published  boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);
create index properties_tenant_idx on properties(tenant_id);
create index properties_slug_idx   on properties(slug) where is_published;

select hz_tenant_rls('properties');
