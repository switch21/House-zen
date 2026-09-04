/**
 * HOUSE-ZEN — Management API SQL runner (one-shot operator helper).
 * Usage: node scripts/db-query.mjs "<sql>"   (reads SUPABASE_ACCESS_TOKEN env)
 * Runs arbitrary SQL against the linked project via the Supabase Management
 * API — used to apply versioned migrations when the CLI is unavailable.
 */
import { readFileSync } from 'node:fs';

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1] ?? '';
const ref = new URL(url).hostname.split('.')[0];
const token = process.env.SUPABASE_ACCESS_TOKEN ?? '';
const sql = process.argv[2];

if (!token || !sql) {
  console.error('usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/db-query.mjs "<sql>"');
  process.exit(2);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: sql }),
});
const body = await res.text();
console.log(`HTTP ${res.status}`);
console.log(body.length > 8000 ? body.slice(0, 8000) + '…(truncated)' : body || '(empty)');
process.exit(res.ok ? 0 : 1);
