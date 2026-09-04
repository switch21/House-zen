-- ============================================================================
-- HOUSE-ZEN — 202609040038_notifications.sql (PHASE 9)
-- Engine: Template → Locale → Channel → Provider → Queue → Delivery → Retry.
-- Channels: EMAIL/SMS/WHATSAPP/IN_APP. Retries + dead-letter tracking.
-- ============================================================================
create table notification_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid references tenants(id) on delete cascade, -- null = platform default
  event_key   text not null,
  channel     notif_channel not null,
  locale      text not null default 'fr',
  version     int not null default 1,
  subject     text not null default '',
  body        text not null,
  variables   text[] not null default '{}',
  created_at  timestamptz not null default now(),
  unique (tenant_id, event_key, channel, locale, version)
);

create table notification_preferences (
  tenant_id          uuid not null references tenants(id) on delete cascade,
  user_id            uuid not null references profiles(id) on delete cascade,
  event_key          text not null,
  channel            notif_channel not null,
  enabled            boolean not null default true,
  marketing_consent  boolean not null default false, -- separate consent (spec)
  primary key (tenant_id, user_id, event_key, channel)
);

create table notification_deliveries (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) on delete cascade,
  user_id       uuid references profiles(id) on delete set null,
  event_id      uuid references domain_events(id) on delete set null,
  channel       notif_channel not null,
  recipient     text,
  title         text not null default '',
  body          text not null default '',
  status        text not null default 'QUEUED' check (status in ('QUEUED','SENT','DELIVERED','FAILED','DEAD_LETTER')),
  attempts      int not null default 0,
  next_retry_at timestamptz,
  sent_at       timestamptz,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);
create index nd_tenant_idx  on notification_deliveries(tenant_id, created_at);
create index nd_retry_idx   on notification_deliveries(next_retry_at) where status = 'QUEUED';

select hz_tenant_rls('notification_templates');
select hz_tenant_rls('notification_deliveries');

-- notifications view used by the app (alias to deliveries for IN_APP).
create or replace view notifications with (security_invoker = true) as
select
  d.id,
  d.tenant_id,
  d.user_id,
  d.channel,
  d.event_id::text as event_key,
  d.title,
  d.body,
  d.read_at,
  d.created_at,
  d.status
from notification_deliveries d
where d.channel = 'IN_APP';

insert into hz_schema_meta(key, value) values ('migration', '202609040038_notifications');
