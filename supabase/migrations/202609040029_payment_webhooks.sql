-- ============================================================================
-- HOUSE-ZEN — 202609040029_payment_webhooks.sql (PHASE 6, spec §15)
-- Signed, authenticated, idempotent, replay-protected webhook ingestion log.
-- ============================================================================
create table payment_webhooks (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  event_id         text not null,
  signature_valid  boolean not null default false,
  payload          jsonb not null,
  processed        boolean not null default false,
  processed_at     timestamptz,
  received_at      timestamptz not null default now(),
  unique (provider, event_id)   -- replay protection: same event processed once
);

alter table payment_webhooks enable row level security;
-- No client policies: only Edge Functions (service role) touch this table.
