-- ============================================================================
-- HOUSE-ZEN — 202609040054_dashboard_kpis_contract.sql
-- Fix production: dashboard_kpis() returned only 7 scalar fields while the
-- frontend KPIs contract (src/lib/api/types.ts, mirrored by the demo adapter)
-- also requires arrivalsToday[], departuresToday[], dirtyRooms, openTickets,
-- revenueSeries[14d], occupancySeries[14d], recentReservations[].
-- Result: TypeError "reading 'length'" at render → blank page AFTER login
-- (production-only: the demo adapter always returned the full contract).
-- Mirrors src/lib/demo/api.ts semantics exactly.
-- ============================================================================
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
    -- scalar KPIs (unchanged contract)
    'occupancyRate', case when v_total_rooms > 0 then round(v_occupied::numeric / v_total_rooms * 100)::int else 0 end,
    'adr', coalesce(v_adr, 0),
    'revpar', v_revpar,
    'revenue30d', v_revenue,
    'expenses30d', v_expenses,
    'occupiedRooms', v_occupied,
    'totalRooms', v_total_rooms,
    -- today's arrivals: PENDING/CONFIRMED with check-in today (cf. demo adapter)
    'arrivalsToday', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select * from reservations
        where tenant_id = v_tenant and check_in_date = current_date
          and status in ('PENDING','CONFIRMED')
        limit 50
      ) r
    ), '[]'::jsonb),
    -- today's departures: in-house guests due out today (cf. demo adapter)
    'departuresToday', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.created_at)
      from (
        select * from reservations
        where tenant_id = v_tenant and check_out_date = current_date
          and status = 'CHECKED_IN'
        limit 50
      ) r
    ), '[]'::jsonb),
    'dirtyRooms', (select count(*) from rooms where tenant_id = v_tenant and housekeeping_state = 'DIRTY'),
    'openTickets', (select count(*) from maintenance_tickets
                    where tenant_id = v_tenant and status in ('OPEN','IN_PROGRESS')),
    -- 14-day revenue/expenses series, zero-filled
    'revenueSeries', coalesce((
      select jsonb_agg(jsonb_build_object('date', d::date, 'revenue', f.rev, 'expenses', f.exp) order by d)
      from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
      cross join lateral (
        select
          coalesce((select sum(amount) from payments p
                    where p.tenant_id = v_tenant and p.status = 'SUCCEEDED'
                      and p.created_at::date = d::date), 0) as rev,
          coalesce((select sum(amount) from expenses e
                    where e.tenant_id = v_tenant and e.spent_at::date = d::date), 0) as exp
      ) f
    ), '[]'::jsonb),
    -- 14-day occupancy rate series, zero-filled
    'occupancySeries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'date', d::date,
               'rate', case when v_total_rooms > 0 then round(o.occ::numeric / v_total_rooms * 100)::int else 0 end
             ) order by d)
      from generate_series(current_date - interval '13 days', current_date, interval '1 day') d
      cross join lateral (
        select count(distinct res.id) as occ
        from reservations res
        where res.tenant_id = v_tenant and res.status = 'CHECKED_IN'
          and d::date >= res.check_in_date and d::date < res.check_out_date
      ) o
    ), '[]'::jsonb),
    -- last 10 reservations for the recent-activity table
    'recentReservations', coalesce((
      select jsonb_agg(to_jsonb(r))
      from (
        select * from reservations
        where tenant_id = v_tenant
        order by created_at desc limit 10
      ) r
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end $$;

insert into hz_schema_meta(key, value) values ('migration', '202609040054_dashboard_kpis_contract');
