-- ============================================================================
-- HOUSE-ZEN — 202609040034_analytics_views.sql (PHASE 7)
-- KPI: occupancy, ADR, RevPAR, revenue vs expenses. Indexed for dashboard perf.
-- ============================================================================
create index reservations_stay_dates_idx on reservations(check_in_date, check_out_date) where status in ('PENDING','CONFIRMED','CHECKED_IN');
create index payments_succeeded_idx on payments(tenant_id, created_at) where status = 'SUCCEEDED';
create index expenses_spent_idx on expenses(tenant_id, spent_at);

-- Daily occupancy per tenant (materialized-friendly view).
create view v_daily_occupancy with (security_invoker = true) as
select
  r.tenant_id,
  d::date as day,
  count(distinct r.id) as occupied_rooms
from reservations r
cross join generate_series(current_date - interval '180 days', current_date + interval '180 days', interval '1 day') d
where r.status in ('CHECKED_IN')
  and d::date >= r.check_in_date and d::date < r.check_out_date
group by r.tenant_id, d;

-- Daily revenue snapshot (payments succeeded) & expenses.
create view v_daily_finance with (security_invoker = true) as
select
  p.tenant_id,
  p.created_at::date as day,
  sum(p.amount) filter (where p.status = 'SUCCEEDED') as revenue,
  0::numeric as expenses
from payments p
group by p.tenant_id, p.created_at::date
union all
select
  e.tenant_id,
  e.spent_at as day,
  0::numeric as revenue,
  sum(e.amount) as expenses
from expenses e
group by e.tenant_id, e.spent_at;

-- Dashboard KPIs (single call for the dashboard page).
create or replace function dashboard_kpis()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_tenant uuid := hz_current_tenant_id();
  v_total_rooms int;
  v_occupied int;
  v_adr numeric(15,2);
  v_revpar numeric(15,2);
  v_revenue numeric(15,2);
  v_expenses numeric(15,2);
  v_result jsonb;
begin
  select count(*) into v_total_rooms from rooms where tenant_id = v_tenant;
  select count(*) into v_occupied
  from reservations res
  join reservation_items ri on ri.reservation_id = res.id
  where res.tenant_id = v_tenant and res.status = 'CHECKED_IN'
    and current_date >= res.check_in_date and current_date < res.check_out_date;

  select coalesce(avg(ri.nightly_rate / greatest(v_res_nights.nights, 1)), 0) into v_adr
  from reservations res
  join reservation_items ri on ri.reservation_id = res.id
  join lateral (select (res.check_out_date - res.check_in_date) as nights) v_res_nights on true
  where res.tenant_id = v_tenant and res.status = 'CHECKED_IN'
    and current_date >= res.check_in_date and current_date < res.check_out_date;

  v_revpar := round(coalesce(v_adr, 0) * (case when v_total_rooms > 0 then v_occupied::numeric / v_total_rooms else 0 end), 2);
  v_revenue := coalesce((select sum(amount) from payments where tenant_id = v_tenant and status = 'SUCCEEDED'), 0);
  v_expenses := coalesce((select sum(amount) from expenses where tenant_id = v_tenant), 0);

  select jsonb_build_object(
    'occupancyRate', case when v_total_rooms > 0 then round(v_occupied::numeric / v_total_rooms * 100)::int else 0 end,
    'adr', coalesce(v_adr, 0),
    'revpar', v_revpar,
    'revenue30d', v_revenue,
    'expenses30d', v_expenses,
    'occupiedRooms', v_occupied,
    'totalRooms', v_total_rooms
  ) into v_result;
  return v_result;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040034_analytics_views');
