-- ============================================================================
-- HOUSE-ZEN — 202609220067_audit_feed_rpc.sql
-- Human-readable audit journal: the tenant audit page previously rendered raw
-- rows (action codes, entity names, truncated actor UUIDs).
-- hz_audit_feed resolves:
--   * the actor's identity (profiles.full_name / email) — profiles RLS only
--     exposes the caller's own row, so a SECURITY DEFINER join is required;
--   * a business reference per entity (reservation reference, invoice number,
--     payment amount+method, property name, room number, …).
-- Tenant-scoped (hz_current_tenant_id), guarded by audit.read, definer-only
-- (never exposed to anon), search over action/entity/actor email.
-- ============================================================================

create or replace function hz_audit_feed(
  p_search text default null,
  p_limit  int  default 200
)
returns table (
  id         uuid,
  action     text,
  entity     text,
  entity_id  uuid,
  ref        text,
  actor_name text,
  actor_email text,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not coalesce(hz_has_permission(hz_current_tenant_id(), 'audit.read'), false) then
    raise exception 'PERMISSION_DENIED: audit.read required' using errcode = '42501';
  end if;

  return query
  with feed as (
    select a.id       as a_id,
           a.action   as a_action,
           a.entity   as a_entity,
           a.entity_id as a_entity_id,
           a.actor_id as a_actor,
           a.created_at as a_created,
           case a.entity
             when 'reservations'      then (select r.reference from reservations r where r.id = a.entity_id)
             when 'invoices'          then (select i.number   from invoices    i where i.id = a.entity_id)
             when 'payments'          then (
               select rtrim(to_char(p.amount, 'FM999999999999990.99'), '.') || ' ' || p.currency
                      || ' · ' || p.method::text
               from payments p where p.id = a.entity_id)
             when 'properties'        then (select pr.name from properties pr where pr.id = a.entity_id)
             when 'rooms'             then (select ro.room_number from rooms ro where ro.id = a.entity_id)
             when 'room_types'        then (select rt.name from room_types rt where rt.id = a.entity_id)
             when 'services'          then (select s.name from services s where s.id = a.entity_id)
             when 'tax_rates'         then (select tr.name from tax_rates tr where tr.id = a.entity_id)
             when 'customers'         then (select c.full_name from customers c where c.id = a.entity_id)
             when 'tenants'           then (select tt.name from tenants tt where tt.id = a.entity_id)
             when 'profiles'          then (select pf.email::text from profiles pf where pf.id = a.entity_id)
             when 'housekeeping_tasks' then (
               select ro.room_number || ' · ' || to_char(h.scheduled_date, 'YYYY-MM-DD')
               from housekeeping_tasks h join rooms ro on ro.id = h.room_id
               where h.id = a.entity_id)
             when 'maintenance_tickets' then (select mt.title from maintenance_tickets mt where mt.id = a.entity_id)
             else null
           end as a_ref
    from audit_logs a
    where a.tenant_id = hz_current_tenant_id()
    order by a.created_at desc
    limit least(greatest(coalesce(p_limit, 200), 1), 500)
  )
  select f.a_id, f.a_action, f.a_entity, f.a_entity_id, f.a_ref,
         coalesce(p.full_name, p.email::text) as actor_name,
         p.email::text as actor_email,
         f.a_created
  from feed f
  left join profiles p on p.id = f.a_actor
  where (p_search is null or btrim(p_search) = ''
         or f.a_action ilike '%' || p_search || '%'
         or f.a_entity ilike '%' || p_search || '%'
         or coalesce(f.a_ref, '') ilike '%' || p_search || '%'
         or coalesce(p.email::text, '') ilike '%' || p_search || '%'
         or coalesce(p.full_name, '') ilike '%' || p_search || '%');
end $$;

revoke execute on function hz_audit_feed(text, int) from public, anon;
grant execute on function hz_audit_feed(text, int) to authenticated;

insert into hz_schema_meta(key, value) values ('migration', '202609220067_audit_feed_rpc')
on conflict do nothing;
