-- ============================================================================
-- HOUSE-ZEN — 202609040051_api_gateway_context.sql (PHASE 8, append-only)
-- Machine context for the REST API gateway (Edge Functions).
--
-- The REST API authenticates machines with API keys (migration 036). Those
-- calls carry no Supabase JWT, so auth.uid() is NULL and the SECURITY
-- DEFINER business functions (reservations, finance) would deny access.
--
-- The gateway (trusted server holding SERVICE_ROLE, never exposed) opens a
-- direct SQL transaction per request and sets TWO TRANSACTION-LOCAL GUCs:
--   SET LOCAL hz.tenant_id = '<verified api-key tenant>'
--   SET LOCAL hz.api_role  = 'receptionist'   -- documented mapping, see below
-- SET LOCAL scope ends with the transaction → no leakage across pooled
-- sessions. The user-JWT path is untouched (GUCs absent → same behavior).
--
-- Role mapping (documented in docs/api.md): every API key operates with the
-- 'receptionist' SQL permission profile — the operational booking profile —
-- while the gateway enforces the finer-grained key scopes (read,
-- write:reservations, write:payments, write:invoices, write:customers)
-- BEFORE any SQL runs. Defense in depth: scopes at the gateway + permissions
-- inside PostgreSQL.
-- ============================================================================

-- Tenant resolution: API gateway context first, then the JWT user context.
create or replace function hz_current_tenant_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('hz.tenant_id', true), '')::uuid,
    (
      select m.tenant_id
      from memberships m
      where m.user_id = auth.uid()
      order by m.created_at
      limit 1
    )
  );
$$;

-- Role resolution: API gateway context acts as the documented API role,
-- human users keep their membership role.
create or replace function hz_role_in_tenant(p_tenant_id uuid)
returns user_role
language sql stable security definer set search_path = public as $$
  select coalesce(
    nullif(current_setting('hz.api_role', true), '')::user_role,
    (
      select m.role from memberships m
      where m.user_id = auth.uid() and m.tenant_id = p_tenant_id
      limit 1
    )
  );
$$;

-- Sanity guard: super-admin bypass is unchanged for humans; in machine
-- context hz_is_super_admin() is false (no JWT), so permissions still apply.
