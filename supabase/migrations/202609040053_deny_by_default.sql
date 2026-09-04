-- ============================================================================
-- HOUSE-ZEN — 202609040053_deny_by_default.sql (PHASE 13 — HARDENING)
-- Ferme la surface découverte au provisionnement :
--   1. Les tables d'infrastructure sans RLS héritaient des default privileges
--      Supabase (ALL + TRUNCATE pour anon/authenticated) : deny-all via RLS
--      sans policy + revokes explicites (défense en profondeur).
--   2. notification_preferences : données personnelles => RLS self-service
--      (l'utilisateur ne gère que SES préférences, dans SON tenant).
--   3. Default privileges : tout objet futur est deny-by-default ; les
--      migrations ultérieures accordent explicitement (même posture que 052).
-- Note: service_role (bypassrls) et le propriétaire postgres conservent l'accès
--       interne ; SECURITY DEFINER s'exécute en tant que owner => non impacté.
-- ============================================================================

-- 1. Infrastructure interne : RLS actif, zéro policy => deny-all côté API
alter table hz_counters enable row level security;
alter table hz_schema_meta enable row level security;
revoke all on table hz_counters from anon, authenticated;
revoke all on table hz_schema_meta from anon, authenticated;

-- 2. Préférences de notification : l'utilisateur ne voit et ne modifie que
--    ses propres lignes, et uniquement au sein de son tenant courant.
alter table notification_preferences enable row level security;
revoke all on table notification_preferences from anon, authenticated;
create policy notification_prefs_self_select on notification_preferences
  for select to authenticated
  using (user_id = auth.uid() and tenant_id = hz_current_tenant_id());
create policy notification_prefs_self_write on notification_preferences
  for all to authenticated
  using (user_id = auth.uid() and tenant_id = hz_current_tenant_id())
  with check (user_id = auth.uid() and tenant_id = hz_current_tenant_id());
grant select, insert, update, delete on table notification_preferences to authenticated;

-- 3. Deny-by-default pour tout objet créé à l'avenir dans public :
--    les migrations suivantes doivent accorder explicitement (posture 052).
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609040053_deny_by_default');
