/** Supprime TOUS les facteurs TOTP du compte cible (nettoyage QA).
 *  Liste les facteurs via GET /auth/v1/user (user.factors) — comme le client
 *  officiel auth-js (mfa.listFactors() lit user.factors ; GET /factors = 405). */
import { readFileSync } from 'node:fs';

const EMAIL = process.env.HZ_TOTP_EMAIL;
const PASSWORD = process.env.HZ_TOTP_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('Usage: HZ_TOTP_EMAIL=... HZ_TOTP_PASSWORD=... node scripts/totp-cleanup.mjs'); process.exit(1); }
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SB_URL = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];

const j = async (r) => { const t = await r.text(); try { return JSON.parse(t); } catch { return { _status: r.status, _empty: true }; } };

const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
}).then(j);
if (!login.access_token) { console.error('login failed:', JSON.stringify(login).slice(0, 200)); process.exit(1); }
const H = { apikey: ANON, Authorization: `Bearer ${login.access_token}` };
const user = await fetch(`${SB_URL}/auth/v1/user`, { headers: H }).then(j);
const all = (user.factors ?? []).filter((f) => f.factor_type === 'totp');
if (all.length === 0) { console.log('0 facteur — compte déjà propre.'); process.exit(0); }
for (const f of all) {
  const res = await fetch(`${SB_URL}/auth/v1/factors/${f.id}`, { method: 'DELETE', headers: H });
  const body = res.status === 204 ? '' : await res.text();
  let ok = res.status === 200 || res.status === 204;
  try { ok = ok || JSON.parse(body).id === f.id; } catch { /* 204 sans corps */ }
  console.log(`supprimé ${f.id} (${f.friendly_name}):`, ok ? 'OK' : `HTTP ${res.status} ${body.slice(0, 120)}`);
}
