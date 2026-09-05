/**
 * HOUSE-ZEN — GoTrue auth config reader/writer (Management API).
 *
 * Usage:
 *   node scripts/auth-config.mjs read
 *   node scripts/auth-config.mjs write <site_url> <redirect_uri1,redirect_uri2,...>
 *
 * Reads SUPABASE_ACCESS_TOKEN + .env.local (VITE_SUPABASE_URL) like db-query.mjs.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1] ?? '';
const ref = new URL(url).hostname.split('.')[0];
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const mode = process.argv[2] ?? 'read';

if (!token) {
  console.error('usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/auth-config.mjs <read|write ...>');
  process.exit(2);
}

const base = `https://api.supabase.com/v1/projects/${ref}/config/auth`;

if (mode === 'read') {
  const res = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json();
  // Print only the fields relevant to Site URL / redirects / email links.
  const keys = [
    'site_url',
    'redirect_uris',
    'uri_allow_list',
    'external_anonymous_users_enabled',
    'mailer_autoconfirm',
    'mailer_secure_email_change_enabled',
    'sms_autoconfirm',
    'external_email_enabled',
  ];
  console.log(`project: ${ref}  (HTTP ${res.status})`);
  for (const k of keys) console.log(`${k} = ${JSON.stringify(body[k])}`);
  process.exit(res.ok ? 0 : 1);
}

if (mode === 'write') {
  const site_url = process.argv[3];
  const list = (process.argv[4] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!site_url || list.length === 0) {
    console.error('usage: node scripts/auth-config.mjs write <site_url> <uri1,uri2,...>');
    process.exit(2);
  }
  // This API version exposes the allow list as `uri_allow_list` (comma-separated
  // string). `redirect_uris` in the response is undefined/ignored on PATCH.
  const res = await fetch(base, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_url, uri_allow_list: list.join(',') }),
  });
  const body = await res.json();
  console.log(`HTTP ${res.status}`);
  console.log(`site_url = ${JSON.stringify(body.site_url)}`);
  console.log(`uri_allow_list = ${JSON.stringify(body.uri_allow_list)}`);
  process.exit(res.ok ? 0 : 1);
}

console.error(`unknown mode: ${mode}`);
process.exit(2);
