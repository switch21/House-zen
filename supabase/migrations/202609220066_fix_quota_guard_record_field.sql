-- ============================================================================
-- HOUSE-ZEN — 202609220066_fix_quota_guard_record_field.sql (hotfix)
-- Bug 064 : le garde hz_quota_guard() référençait NEW.user_id dans une
-- expression IF partagée par les trois tables. plpgsql résout les champs
-- d'un record à la PRÉPARATION de l'expression (pas à l'évaluation du
-- booléen) → sur rooms/properties (sans colonne user_id) chaque INSERT
-- levait « record "new" has no field "user_id" ».
--
-- Correctif : les références propres à memberships sont isolées dans une
-- instruction SELECT..INTO placée DANS la branche IF — jamais préparée pour
-- les autres tables. new.tenant_id reste commun (colonne présente partout).
-- ============================================================================

create or replace function hz_quota_guard()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_kind     text := case tg_table_name when 'memberships' then 'users' else tg_table_name end;
  v_existing boolean := false;
begin
  if tg_table_name = 'memberships' then
    -- Branche dédiée : NEW.user_id n'est résolu QUE pour memberships
    -- (re-affectation via ON CONFLICT DO UPDATE = rôle mis à jour, pas un
    -- nouveau siège → jamais comptée dans le quota).
    select exists (
      select 1 from memberships m
      where m.tenant_id = new.tenant_id and m.user_id = new.user_id
    ) into v_existing;
    if v_existing then
      return new;
    end if;
  end if;

  perform hz_assert_quota(new.tenant_id, v_kind);
  return new;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609220066_fix_quota_guard_record_field');
