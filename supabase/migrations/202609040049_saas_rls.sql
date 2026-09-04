-- ============================================================================
-- HOUSE-ZEN — 202609040049_saas_rls.sql (PHASE 12)
-- Super Admin hard boundaries: platform functions locked to is_super_admin,
-- impersonation stub audited (never silent), public booking functions exposed.
-- ============================================================================
create or replace function admin_list_tenants()
returns setof tenants
language sql stable security definer set search_path = public as $$
  select * from tenants order by created_at;
$$;

revoke execute on function admin_list_tenants() from public, anon, authenticated;
create policy admin_list_gate on tenants
  for select to authenticated using (hz_is_super_admin());

-- Impersonation: audited stub. Implementation requires an Edge Function issuing
-- a scoped JWT; the DB gate records every attempt (spec §31).
create or replace function admin_impersonation_attempt(p_tenant_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not hz_is_super_admin() then
    raise exception 'PERMISSION_DENIED' using errcode = '42501';
  end if;
  insert into audit_logs (tenant_id, actor_id, action, entity, entity_id)
  values (p_tenant_id, auth.uid(), 'admin.impersonation_attempt', 'tenants', p_tenant_id);
end $$;

-- Public booking functions (anon role) — minimal, read-mostly surface.
create or replace function public_property_details(p_slug text)
returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', pr.id, 'name', pr.name, 'slug', pr.slug,
    'city', pr.city, 'country', pr.country, 'currency', t.currency,
    'room_types', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rt.id, 'name', rt.name, 'description', rt.description,
        'base_price', rt.base_price, 'max_occupancy', rt.max_occupancy)), '[]')
      from room_types rt where rt.property_id = pr.id))
  from properties pr
  join tenants t on t.id = pr.tenant_id
  where pr.slug = p_slug and pr.is_published = true;
$$;

create or replace function public_search_availability(
  p_slug text, p_check_in date, p_check_out date, p_adults int
) returns table (
  room_type_id uuid, name text, description text, max_occupancy int,
  available_rooms bigint, nightly_rate numeric(15,2), currency char(3), amenities jsonb
)
language sql stable security definer set search_path = public as $$
  select * from search_available_room_types(
    (select id from properties where slug = p_slug and is_published = true),
    p_check_in, p_check_out, p_adults);
$$;

grant execute on function public_property_details(text) to anon, authenticated;
grant execute on function public_search_availability(text, date, date, int) to anon, authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609040049_saas_rls');
