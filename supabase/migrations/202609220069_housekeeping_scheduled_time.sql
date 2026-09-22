-- ============================================================================
-- HOUSE-ZEN — 202609220069_housekeeping_scheduled_time.sql
-- User-reported: "impossible d'établir une heure avec la date" when planning
-- a housekeeping task. scheduled_date is date-only; add an optional
-- scheduled_time so staff can plan morning/afternoon interventions.
-- Nullable: existing rows keep their date-only planning.
-- ============================================================================

alter table housekeeping_tasks
  add column if not exists scheduled_time time;

insert into hz_schema_meta(key, value) values ('migration', '202609220069_housekeeping_scheduled_time')
on conflict do nothing;
