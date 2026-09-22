-- 202609220061 — Ensure pgcrypto is installed in the `extensions` schema.
--
-- Context: the super-admin "reset password" dialog (admin_set_user_password,
-- migration 059) silently failed in production: the confirm button did
-- nothing because the error banner rendered behind the modal (fixed in UI in
-- the same release) — and plpgsql defers function name resolution to call
-- time, so if `extensions.crypt` / `extensions.gen_salt` (pgcrypto) are not
-- installed on a project, BOTH admin_set_user_password and admin_create_user
-- compile fine at migration time but fail at call time with
-- "function extensions.crypt does not exist".
--
-- This migration makes the dependency explicit and idempotent, then asserts
-- it so a missing extension fails loudly at deploy time instead of runtime.

create extension if not exists pgcrypto with schema extensions;

do $$
begin
  if not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.proname in ('crypt', 'gen_salt')
      and n.nspname = 'extensions'
  ) then
    raise exception 'PGCRYPTO_MISSING: extensions.crypt / extensions.gen_salt unavailable';
  end if;
end $$;

insert into hz_schema_meta(key, value)
values ('migration', '202609220061_ensure_pgcrypto_admin_password');
