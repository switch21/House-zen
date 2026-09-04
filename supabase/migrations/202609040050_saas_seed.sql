-- ============================================================================
-- HOUSE-ZEN — 202609040050_saas_seed.sql (PHASE 12)
-- Official plan catalogue + default feature flags. Idempotent.
-- ============================================================================
insert into plans (code, name, monthly_price, currency, max_properties, max_rooms, max_users)
values
  ('FREE',       'Gratuit',    0,     'XAF', 1,   5,    2),
  ('STARTER',    'Starter',    15000, 'XAF', 1,   20,   5),
  ('PRO',        'Pro',        35000, 'XAF', 3,   100,  15),
  ('BUSINESS',   'Business',   75000, 'XAF', 10,  400,  50),
  ('ENTERPRISE', 'Entreprise', 0,     'XAF', 999, 9999, 999)
on conflict (code) do nothing;

insert into plan_entitlements (plan_id, feature)
select p.id, f.feature
from plans p
cross join (values
  ('basic_pms'), ('public_widget'), ('reports'), ('api'), ('ota_sync')
) as f(feature)
where (p.code = 'FREE'      and f.feature in ('basic_pms'))
   or (p.code = 'STARTER'   and f.feature in ('basic_pms','public_widget'))
   or (p.code = 'PRO'       and f.feature in ('basic_pms','public_widget','reports','api'))
   or (p.code = 'BUSINESS'  and f.feature in ('basic_pms','public_widget','reports','api','ota_sync'))
   or (p.code = 'ENTERPRISE')
on conflict do nothing;

insert into feature_flags (tenant_id, key, enabled)
values
  (null, 'public_widget', true),
  (null, 'ota_sync', false),
  (null, 'mobile_money_gateway', true)
on conflict (tenant_id, key) do nothing;

insert into hz_schema_meta(key, value) values ('migration', '202609040050_saas_seed');
