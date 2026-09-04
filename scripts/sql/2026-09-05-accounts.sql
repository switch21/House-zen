-- ============================================================================
-- HOUSE-ZEN — Comptes opérationnels (super admin + 3 profils manquants)
-- Idempotent : ré-exécutable sans dupliquer (users par email, identités par
-- (user_id, provider), profiles/memberships par upsert sur clé).
-- Prérequis : aucun trigger GoTrue ici — profils créés explicitement.
-- ============================================================================
-- 1. auth.users (confirmés, mot de passe bcrypt)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  created_at, updated_at, raw_app_meta_data, raw_user_meta_data,
  email_change, email_change_token_new, confirmation_token, recovery_token,
  is_sso_user
)
select
  '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated',
  'authenticated', x.email, crypt(x.pwd, gen_salt('bf')), now(),
  now(), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
  '', '', '', '', false
from (values
  ('pat.epee@gmail.com',            'HZ-super!2026@PatEpee'),
  ('accountant@house-zen.app',      'HZ-2026!ComptaZ'),
  ('housekeeping@house-zen.app',    'HZ-2026!MenageZ'),
  ('maintenance@house-zen.app',     'HZ-2026!MaintZ')
) as x(email, pwd)
where not exists (
  select 1 from auth.users u where lower(u.email) = lower(x.email)
);

-- 2. auth.identities (provider email) — schéma GoTrue récent : `provider`,
--    colonne email GENERÉE (jamais insérée explicitement).
insert into auth.identities (
  user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
  now(), now(), now()
from auth.users u
where lower(u.email) in ('pat.epee@gmail.com','accountant@house-zen.app','housekeeping@house-zen.app','maintenance@house-zen.app')
  and not exists (
    select 1 from auth.identities i
    where i.user_id = u.id and i.provider_id = 'email'
  );

-- 3. profiles (pat.epee = super admin plateforme)
insert into public.profiles (id, email, full_name, is_super_admin)
select u.id, u.email,
  case lower(u.email)
    when 'pat.epee@gmail.com'         then 'Pat Epee'
    when 'accountant@house-zen.app'   then 'Comptable Zen'
    when 'housekeeping@house-zen.app' then 'Ménage Zen'
    else 'Maintenance Zen'
  end,
  (lower(u.email) = 'pat.epee@gmail.com')
from auth.users u
where lower(u.email) in ('pat.epee@gmail.com','accountant@house-zen.app','housekeeping@house-zen.app','maintenance@house-zen.app')
on conflict (id) do update
  set is_super_admin = (lower(profiles.email) = 'pat.epee@gmail.com'),
      full_name = coalesce(nullif(profiles.full_name, ''), excluded.full_name);

-- 4. memberships (rôle fonctionnel par profil)
insert into public.memberships (tenant_id, user_id, role)
select '85a171f5-7058-41e1-ad8d-9e1792ff0417', u.id,
  (case lower(u.email)
    when 'pat.epee@gmail.com'       then 'owner'
    when 'accountant@house-zen.app' then 'accountant'
    when 'housekeeping@house-zen.app' then 'housekeeping'
    else 'maintenance'
  end)::user_role
from auth.users u
where lower(u.email) in ('pat.epee@gmail.com','accountant@house-zen.app','housekeeping@house-zen.app','maintenance@house-zen.app')
on conflict (tenant_id, user_id) do update set role = excluded.role;

-- Contrôle
select u.email, p.full_name, p.is_super_admin, m.role
from auth.users u
join public.profiles p on p.id = u.id
left join public.memberships m on m.user_id = u.id
where lower(u.email) in ('pat.epee@gmail.com','accountant@house-zen.app','housekeeping@house-zen.app','maintenance@house-zen.app')
order by u.email;
