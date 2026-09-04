-- ============================================================================
-- HOUSE-ZEN — 202609040001_initial_schema.sql
-- Core multi-tenant schema: tenants, profiles, memberships + enums.
-- All business tables carry tenant_id UUID NOT NULL (spec §5).
-- Financial amounts: NUMERIC(15,2) — never FLOAT (spec §8).
-- Instants: timestamptz (spec §9). Default TZ: Africa/Douala (tenant config).
-- ============================================================================

-- ---------------------------------------------------------------- enums -----
create type tenant_status        as enum ('ACTIVE', 'SUSPENDED', 'CANCELLED');
create type user_role            as enum ('owner','manager','receptionist','accountant','housekeeping','maintenance');
create type property_type        as enum ('HOTEL','RESIDENCE','HOSTEL','FURNISHED_APARTMENT','GUESTHOUSE');
create type room_status          as enum ('OPERATIONAL','UNDER_MAINTENANCE');
create type housekeeping_state   as enum ('DIRTY','CLEANING','INSPECTED','CLEAN');
create type reservation_status   as enum ('DRAFT','PENDING','CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW');
create type reservation_source   as enum ('BACK_OFFICE','PUBLIC_WIDGET','API');
create type hk_task_status       as enum ('PENDING','IN_PROGRESS','DONE','BLOCKED');
create type ticket_priority      as enum ('LOW','NORMAL','HIGH','URGENT');
create type ticket_status        as enum ('OPEN','IN_PROGRESS','RESOLVED','CLOSED');
create type invoice_status       as enum ('DRAFT','ISSUED','PARTIALLY_PAID','PAID','VOID');
create type payment_method       as enum ('CASH','MOBILE_MONEY','CARD','BANK_TRANSFER','OTHER');
create type payment_status       as enum ('PENDING','PROCESSING','SUCCEEDED','FAILED','CANCELLED','REFUNDED','PARTIALLY_REFUNDED');
create type notif_channel        as enum ('EMAIL','SMS','WHATSAPP','IN_APP');
create type subscription_status  as enum ('TRIALING','ACTIVE','PAST_DUE','SUSPENDED','CANCELLED');
create type plan_code            as enum ('FREE','STARTER','PRO','BUSINESS','ENTERPRISE');

-- ------------------------------------------------------------- tenants ------
create table tenants (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 2 and 120),
  slug        text not null unique check (slug ~ '^[a-z0-9-]+$'),
  status      tenant_status not null default 'ACTIVE',
  currency    char(3) not null default 'XAF',
  timezone    text not null default 'Africa/Douala',
  locale      text not null default 'fr' check (locale in ('fr','en','es','de','ar','it','sw')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------ profiles ------
-- profiles.id mirrors auth.users.id (Supabase Auth).
create table profiles (
  id             uuid primary key references auth.users(id) on delete cascade,
  email          citext not null unique,
  full_name      text not null default '',
  locale         text not null default 'fr' check (locale in ('fr','en','es','de','ar','it','sw')),
  is_super_admin boolean not null default false,
  mfa_enrolled   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- ---------------------------------------------------------- memberships -----
-- Resolution chain (spec §5): auth.uid() → membership → tenant_id.
create table memberships (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references tenants(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role       user_role not null default 'receptionist',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);
create index memberships_user_idx   on memberships(user_id);
create index memberships_tenant_idx on memberships(tenant_id);

-- ------------------------------------------------- core infra tables --------
-- Audit log (spec §30): append-only (no update/delete grants anywhere).
create table audit_logs (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid references tenants(id) on delete cascade,
  actor_id   uuid references profiles(id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  request_id text,
  created_at timestamptz not null default now()
);
create index audit_logs_tenant_idx on audit_logs(tenant_id, created_at);
create index audit_logs_entity_idx on audit_logs(entity, entity_id);

-- Domain events (PHASE 9 entry point).
create table domain_events (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid references tenants(id) on delete cascade,
  event_key    text not null,
  payload      jsonb not null default '{}',
  processed_at timestamptz,
  created_at   timestamptz not null default now()
);
create index domain_events_tenant_idx on domain_events(tenant_id, created_at);
create index domain_events_unprocessed_idx on domain_events(created_at) where processed_at is null;

-- ---------------------------------------------------- updated_at trigger ----
create or replace function hz_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger tenants_touch before update on tenants
  for each row execute function hz_touch_updated_at();
create trigger profiles_touch before update on profiles
  for each row execute function hz_touch_updated_at();

-- ------------------------------------------------------------- invitee ------
-- Helper used by onboarding: create tenant + owner membership atomically.
create table hz_schema_meta (
  key text primary key,
  value text not null,
  applied_at timestamptz not null default now()
);
insert into hz_schema_meta(key, value) values ('migration', '202609040001_initial_schema');
