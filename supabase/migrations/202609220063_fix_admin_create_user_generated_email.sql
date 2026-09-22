-- 202609220063 — Fix admin_create_user for the current GoTrue schema.
--
-- Symptom (found while E2E-proving the 062 grants fix on prod):
--   admin_create_user -> 400 "cannot insert a non-DEFAULT value into column
--   \"email\" (428C9): Column \"email\" is a generated column."
--
-- Cause: newer GoTrue versions made auth.identities.email a GENERATED ALWAYS
-- AS lower(identity_data->>'email') STORED column. Migration 059 inserted an
-- explicit email value into auth.identities, which newer GoTrue rejects.
-- (auth.users.email is still a plain column — the auth.users insert is fine.)
--
-- Fix: three schema drifts in current GoTrue, all in this function's inserts:
--   1. identities.email is GENERATED ALWAYS AS lower(identity_data->>'email')
--      STORED — never insert it explicitly (428C9).
--   2. Column semantics: provider_id = the provider's user identifier (the
--      `sub`), provider = provider NAME ('email'). Migration 059 used the old
--      layout (provider_id='email', no provider) -> 23502 null in provider.
--   3. GoTrue's Go model scans auth.users token columns as NON-NULLABLE
--      strings: confirmation_token / recovery_token / email_change /
--      email_change_token_new must be '' (as GoTrue itself writes), not NULL,
--      otherwise every password login of the created user dies with
--      500 "Database error querying schema" (NULL scan failure).
-- Mirrors exactly what GoTrue itself writes for email identities
-- (verified against owner@house-zen.app live row).
-- Security posture unchanged (hz_is_super_admin gate, audited, SECURITY DEFINER).

create or replace function admin_create_user(
  p_email text, p_full_name text, p_password text, p_locale text default 'fr'
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_id uuid := gen_random_uuid();
  v_email citext := lower(btrim(p_email));
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED: super admin only' using errcode = '42501';
  end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'INVALID_EMAIL';
  end if;
  if coalesce(p_password, '') = '' then
    raise exception 'PASSWORD_REQUIRED';
  end if;
  if char_length(p_password) < 8 then
    raise exception 'PASSWORD_TOO_SHORT';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email) then
    raise exception 'EMAIL_TAKEN';
  end if;

  -- GoTrue-compatible auth row (provider email, confirmed). Flow-token
  -- columns are '' (GoTrue convention) — NULL breaks its non-nullable scan
  -- on subsequent password logins.
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change, email_change_token_new,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}',
    jsonb_build_object('full_name', p_full_name),
    '', '', '', '',
    now(), now()
  );

  -- identities.email is GENERATED in current GoTrue: derived from
  -- identity_data->>'email' — never insert it explicitly.
  -- provider_id = sub (provider user id), provider = 'email' (name).
  insert into auth.identities (provider_id, user_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
  values (
    v_id::text, v_id, 'email',
    jsonb_build_object('sub', v_id::text, 'email', v_email::text, 'email_verified', true),
    now(), now(), now()
  );

  insert into profiles (id, email, full_name, locale, is_super_admin)
  values (v_id, v_email, p_full_name, p_locale, false)
  on conflict (id) do update set full_name = excluded.full_name;

  perform hz_audit('admin.user_created', 'profiles', v_id, null,
                   jsonb_build_object('email', v_email::text, 'full_name', p_full_name));
  return jsonb_build_object('id', v_id, 'email', v_email::text, 'full_name', p_full_name);
end $$;

insert into hz_schema_meta(key, value)
values ('migration', '202609220063_fix_admin_create_user_generated_email');
