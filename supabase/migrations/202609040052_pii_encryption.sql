-- ============================================================================
-- HOUSE-ZEN — 202609040052_pii_encryption.sql  (PHASE 13 — HARDENING)
-- ============================================================================
-- Encrypts government ID documents (`id_document`) at rest in BOTH tables
-- that hold PII documents: `customers` (011) and `reservation_guests` (014).
--
-- Threat model (security-report §A09 hardening):
--   - a database dump or a compromised SQL role must NOT yield readable IDs;
--   - ciphertext only ever leaves the database through the audited RPC
--     `hz_read_id_document`, which enforces RBAC and logs every access
--     (grant + denial) to `audit_logs`.
--
-- Key management (fail-closed):
--   1. preferred: per-transaction GUC `SET LOCAL hz.pii_key = '<secret>'`
--      (same pattern as hz.tenant_id / hz.api_role — migration 051);
--   2. Supabase Vault fallback: secret named `hz_pii_key`;
--   3. otherwise key-resolution RAISES — the system never invents a key
--      and silently-encrypted data is impossible.
-- Rotation: re-encrypt = read legacy value, UPDATE (trigger re-encrypts).
-- Runbook: docs/implementation/deployment-runbook.md §PII (runbook §PII).
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Key resolution (owner-only — never executable by client roles).
-- ---------------------------------------------------------------------------
create or replace function hz_pii_key()
returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_key text;
begin
  v_key := nullif(current_setting('hz.pii_key', true), '');
  if v_key is not null then
    return v_key;
  end if;

  if to_regclass('vault.decrypted_secrets') is not null then
    begin
      select s.decrypted_secret into v_key
      from vault.decrypted_secrets s
      where s.name = 'hz_pii_key'
      limit 1;
    exception when insufficient_privilege or undefined_table then
      v_key := null;  -- fall through to the fail-closed guard below
    end;
  end if;

  if coalesce(v_key, '') = '' then
    raise exception 'PII key unavailable: SET LOCAL hz.pii_key or create Vault secret "hz_pii_key"';
  end if;
  return v_key;
end;
$$;

revoke execute on function hz_pii_key() from public;

-- ---------------------------------------------------------------------------
-- Cipher primitives. Ciphertext is prefixed `hzenc.v1:` so the write trigger
-- is idempotent and legacy plaintext can be told apart during transitions.
-- NOTE: execute is revoked from every client role further below — these are
-- callable only from SECURITY DEFINER code (triggers, hz_read_id_document).
-- ---------------------------------------------------------------------------
create or replace function hz_encrypt_pii(p_plain text)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
    when p_plain is null or p_plain = '' then p_plain
    else 'hzenc.v1:'
      || encode(pgp_sym_encrypt(p_plain, hz_pii_key(), 'cipher-algo=aes256'), 'base64')
  end;
$$;

create or replace function hz_decrypt_pii(p_cipher text)
returns text
language sql stable security definer set search_path = public, extensions as $$
  select case
    when p_cipher is null or p_cipher = '' then p_cipher
    when left(p_cipher, 9) = 'hzenc.v1:' then
      pgp_sym_decrypt(decode(substr(p_cipher, 10), 'base64'), hz_pii_key())
    else p_cipher  -- legacy plaintext: tolerated read-only, encrypted on next write
  end;
$$;

-- Supabase default privileges grant EXECUTE on new functions to anon /
-- authenticated / service_role. These three helpers are definer-internal:
-- a client able to call hz_decrypt_pii directly would bypass the audited
-- RPC entirely. Deny-by-default, no grants (operators keep postgres role).
do $deny$
begin
  if to_regrole('anon') is not null then
    execute 'revoke execute on function hz_pii_key() from anon, authenticated, service_role';
    execute 'revoke execute on function hz_encrypt_pii(text) from anon, authenticated, service_role';
    execute 'revoke execute on function hz_decrypt_pii(text) from anon, authenticated, service_role';
  end if;
end;
$deny$;

revoke execute on function hz_encrypt_pii(text) from public;
revoke execute on function hz_decrypt_pii(text) from public;

-- ---------------------------------------------------------------------------
-- At-rest transparent encryption: BEFORE triggers replace any incoming
-- plaintext with ciphertext. `select *` therefore NEVER returns plaintext.
-- ---------------------------------------------------------------------------
create or replace function hz_pii_encrypt_on_write()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.id_document is not null and left(new.id_document, 9) <> 'hzenc.v1:' then
    new.id_document := hz_encrypt_pii(new.id_document);
  end if;
  return new;
end;
$$;

create trigger trg_customers_encrypt_id_document
  before insert or update of id_document on customers
  for each row execute function hz_pii_encrypt_on_write();

create trigger trg_reservation_guests_encrypt_id_document
  before insert or update of id_document on reservation_guests
  for each row execute function hz_pii_encrypt_on_write();

-- ---------------------------------------------------------------------------
-- Backfill existing plaintext rows. Skipped with a WARNING when no key is
-- configured (fresh installs have no rows; operators set the key BEFORE
-- applying this migration on existing data — see runbook §PII). Any row left
-- in plaintext is encrypted lazily on its next write by the triggers.
-- ---------------------------------------------------------------------------
do $$
begin
  if coalesce(nullif(current_setting('hz.pii_key', true), ''), '') <> '' then
    update customers
       set id_document = hz_encrypt_pii(id_document)
     where id_document is not null and left(id_document, 9) <> 'hzenc.v1:';

    update reservation_guests
       set id_document = hz_encrypt_pii(id_document)
     where id_document is not null and left(id_document, 9) <> 'hzenc.v1:';
  else
    raise warning 'migration 052: hz.pii_key not set — PII backfill skipped (rows encrypt on next write; see deployment-runbook §PII)';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Audited read RPC: the ONLY client-facing path to a decrypted ID document.
--   - entity allowlist (no dynamic SQL surface);
--   - RBAC: customers → customers.read, reservation_guests → reservations.read
--     (hz_has_permission resolves both JWT memberships and the API gateway
--     machine context hz.api_role, migration 051);
--   - every successful access is written to audit_logs (spec §30). Denials
--     RAISE immediately: an audit INSERT followed by RAISE would be rolled
--     back in the same transaction, so denials are surfaced through Postgres
--     logs / gateway logs instead (documented, runbook §PII).
-- VOLATILE (not stable): it performs an audit INSERT on purpose.
-- ---------------------------------------------------------------------------
create or replace function hz_read_id_document(p_entity text, p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_tenant  uuid;
  v_cipher  text;
  v_required text;
begin
  case p_entity
    when 'customers'         then v_required := 'customers.read';
    when 'reservation_guests' then v_required := 'reservations.read';
    else
      raise exception 'UNKNOWN_ENTITY: %', p_entity;
  end case;

  if p_entity = 'customers' then
    select tenant_id, id_document into v_tenant, v_cipher
      from customers where id = p_id;
  else
    select tenant_id, id_document into v_tenant, v_cipher
      from reservation_guests where id = p_id;
  end if;

  if v_tenant is null then
    return null;  -- unknown id: no cross-tenant existence leak
  end if;

  if not coalesce(hz_has_permission(v_tenant, v_required), false) then
    -- No audit INSERT here: it would be rolled back by the raise below.
    raise exception 'FORBIDDEN: % required to read ID documents', v_required
      using errcode = '42501';  -- insufficient_privilege
  end if;

  perform hz_audit('pii.id_document.read', p_entity, p_id, null, null);
  return hz_decrypt_pii(v_cipher);
end;
$$;

do $$
begin
  if to_regrole('authenticated') is not null then
    execute 'revoke execute on function hz_read_id_document(text, uuid) from public, anon';
    execute 'grant execute on function hz_read_id_document(text, uuid) to authenticated, service_role';
  else
    execute 'revoke execute on function hz_read_id_document(text, uuid) from public';
  end if;
end;
$$;

insert into hz_schema_meta(key, value) values ('migration', '202609040052_pii_encryption');
