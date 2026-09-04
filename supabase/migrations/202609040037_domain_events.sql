-- ============================================================================
-- HOUSE-ZEN — 202609040037_domain_events.sql (PHASE 9)
-- Core table lives in 202609040001 (policy dependency order).
-- This migration adds the notification-engine processing fields & indexes.
-- ============================================================================
create index if not exists domain_events_key_idx on domain_events(event_key, created_at);

insert into hz_schema_meta(key, value) values ('migration', '202609040037_domain_events');
