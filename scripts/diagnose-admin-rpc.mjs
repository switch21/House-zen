/**
 * HOUSE-ZEN — Diagnostic: super-admin user RPCs (esp. admin_set_user_password).
 * READ-ONLY. Run with Management API access:
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/diagnose-admin-rpc.mjs
 *
 * Checks (service-role/postgres context, bypasses hz_is_super_admin on purpose):
 *   1. pgcrypto installed in `extensions` (crypt / gen_salt resolvable?)
 *   2. admin_set_user_password / admin_create_user present + signatures
 *   3. hz_audit signature used by the RPCs
 *   4. latest hz_audit rows for admin.user_password_reset (did calls land?)
 *   5. dry-compile: attempt extensions.crypt('x', extensions.gen_salt('bf'))
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1] ?? '';
const ref = new URL(url).hostname.split('.')[0];
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';

if (!token) {
  console.error('usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/diagnose-admin-rpc.mjs');
  process.exit(2);
}

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  return { status: res.status, body };
}

const checks = [
  ['pgcrypto extension', `select extname, extnamespace::regnamespace as schema from pg_extension where extname = 'pgcrypto'`],
  ['crypt/gen_salt resolvable', `select extensions.crypt('diag', extensions.gen_salt('bf')) is not null as crypt_ok`],
  ['admin RPCs present', `select p.proname, pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('admin_set_user_password','admin_create_user','admin_update_user','admin_delete_user') order by 1`],
  ['hz_audit present', `select pg_get_function_identity_arguments(p.oid) as args from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'hz_audit'`],
  ['audit trail admin.user_password_reset', `select created_at, action, entity_id from audit_logs where action = 'admin.user_password_reset' order by created_at desc limit 5`],
];

let bad = 0;
for (const [name, sql] of checks) {
  const { status, body } = await q(sql);
  let rows;
  try {
    rows = JSON.parse(body);
  } catch {
    rows = body.slice(0, 300);
  }
  const empty = Array.isArray(rows) && rows.length === 0;
  // Management API /database/query answers 201 (Created), not 200.
  if (!(status === 200 || status === 201)) bad++;
  console.log(`\n[${status === 200 || (status === 201 && !empty) ? 'OK' : 'WARN'}] ${name} (HTTP ${status})`);
  console.log(typeof rows === 'string' ? rows : JSON.stringify(rows, null, 2).slice(0, 800));
}
console.log(`\n=== ${bad === 0 ? 'ALL CHECKS PASSED' : `${bad} check(s) need attention`} ===`);
if (bad > 0) process.exit(1);
