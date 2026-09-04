-- ============================================================================
-- HOUSE-ZEN — 202609040035_api_idempotency.sql (PHASE 8)
-- Generic idempotency store for REST API writes (spec: idempotency).
-- ============================================================================
create table api_idempotency (
  tenant_id   uuid not null,
  key         text not null,
  endpoint    text not null,
  request_hash text not null,
  response    jsonb,
  status_code int,
  created_at  timestamptz not null default now(),
  primary key (tenant_id, key)
);

alter table api_idempotency enable row level security;
-- Accessed only by Edge Functions via service role; no client policies.

create index api_idempotency_created_idx on api_idempotency(created_at);
