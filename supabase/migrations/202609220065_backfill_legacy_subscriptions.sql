-- ============================================================================
-- HOUSE-ZEN — 202609220065_backfill_legacy_subscriptions.sql
-- Every tenant MUST have a subscription (059 provisions new tenants with a
-- FREE one at creation; subscriptions.tenant_id is UNIQUE). Tenants created
-- BEFORE 059 have none — quota enforcement (064) is fail-closed for them,
-- which would freeze an existing business.
--
-- Backfill: for each tenant WITHOUT any subscription row, grant the smallest
-- catalogue plan that fits its CURRENT usage, ACTIVE for 1 year. Continuity
-- first: existing operations keep working, and the super admin can change the
-- plan from /admin at any time. A tenant already over every catalogue plan
-- stays unprovisioned (fail-closed on new resources — nothing legitimate fits).
-- Idempotent: tenants with a row (any status) are skipped.
-- ============================================================================

insert into subscriptions (tenant_id, plan_id, status, current_period_start, current_period_end)
select t.id, p.id, 'ACTIVE', now(), now() + interval '1 year'
from tenants t
join plans p on p.id = (
  select p2.id
  from plans p2
  where (select count(*) from properties  pr where pr.tenant_id = t.id) <= p2.max_properties
    and (select count(*) from rooms       r  where r.tenant_id = t.id) <= p2.max_rooms
    and (select count(*) from memberships m  where m.tenant_id = t.id) <= p2.max_users
  order by case p2.code
    when 'FREE' then 1
    when 'STARTER' then 2
    when 'PRO' then 3
    when 'BUSINESS' then 4
    when 'ENTERPRISE' then 5
    else 6
  end
  limit 1
)
where not exists (select 1 from subscriptions s where s.tenant_id = t.id);

insert into hz_schema_meta(key, value) values ('migration', '202609220065_backfill_legacy_subscriptions');
