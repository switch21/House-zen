/**
 * HOUSE-ZEN — preuve E2E de l'exigence AAL2 (migration 060) en production.
 * 1. Login super admin SANS MFA → jeton AAL1
 * 2. RPC admin_stats avec AAL1 → REFUSÉ (PERMISSION_DENIED / 42501)
 * 3. enroll TOTP → challenge → verify → NOUVEAU jeton AAL2
 * 4. RPC admin_stats avec AAL2 → ACCEPTÉ (KPI JSON)
 * 5. unenroll (session AAL2 requise) → compte laissé propre
 *
 * Usage: HZ_TOTP_EMAIL=... HZ_TOTP_PASSWORD=... node scripts/test-aal2-e2e.mjs
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.HZ_TOTP_EMAIL;
const PASSWORD = process.env.HZ_TOTP_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Usage: HZ_TOTP_EMAIL=... HZ_TOTP_PASSWORD=... node scripts/test-aal2-e2e.mjs');
  process.exit(1);
}
const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SB_URL = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];

function base32Decode(s) {
  const alpha = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0, value = 0;
  const out = [];
  for (const c of s.replace(/=+$/, '').toUpperCase()) {
    const idx = alpha.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}
function totp(secretB32) {
  const key = base32Decode(secretB32);
  const t = Math.floor(Date.now() / 30000);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(t / 2 ** 32), 0);
  buf.writeUInt32BE(t % 2 ** 32, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1e6;
  return String(code).padStart(6, '0');
}
const j = (r) => r.text().then((t) => { try { return JSON.parse(t); } catch { return { _status: r.status, _raw: t.slice(0, 200) }; } });

async function main() {
  // 1. Login → jeton AAL1 (aucun facteur vérifié)
  const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then(j);
  if (!login.access_token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  const claims1 = JSON.parse(Buffer.from(login.access_token.split('.')[1], 'base64').toString());
  const H1 = { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
  console.log(`1. LOGIN OK — aal=${claims1.aal ?? 'aal1'}`);

  // 2. RPC admin_stats en AAL1 → doit être REFUSÉ (migration 060)
  const denied = await fetch(`${SB_URL}/rest/v1/rpc/admin_stats`, { method: 'POST', headers: H1, body: '{}' }).then(j);
  const refused = denied.code === '42501' || String(denied.message ?? '').includes('PERMISSION_DENIED');
  if (!refused) throw new Error('AAL1 non bloqué !? ' + JSON.stringify(denied).slice(0, 300));
  console.log(`2. RPC admin_stats AAL1 → REFUSÉ ✓ (${denied.code} ${String(denied.message).slice(0, 60)})`);

  // 3. Enroll TOTP + challenge + verify → jeton AAL2
  const enroll = await fetch(`${SB_URL}/auth/v1/factors`, {
    method: 'POST', headers: H1,
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'qa-aal2-proof' }),
  }).then(j);
  if (!enroll.id || !enroll.totp?.secret) throw new Error('enroll failed: ' + JSON.stringify(enroll).slice(0, 200));
  const ch = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/challenge`, { method: 'POST', headers: H1 }).then(j);
  if (!ch.id) throw new Error('challenge failed: ' + JSON.stringify(ch).slice(0, 200));
  const code = totp(enroll.totp.secret);
  const ver = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/verify`, {
    method: 'POST', headers: H1, body: JSON.stringify({ challenge_id: ch.id, code }),
  }).then(j);
  if (!ver.access_token && ver.verified !== true) throw new Error('verify failed: ' + JSON.stringify(ver).slice(0, 300));
  const claims2 = ver.access_token ? JSON.parse(Buffer.from(ver.access_token.split('.')[1], 'base64').toString()) : {};
  if (claims2.aal !== 'aal2') throw new Error('session pas AAL2 après verify: ' + JSON.stringify(claims2).slice(0, 150));
  const H2 = { apikey: ANON, Authorization: `Bearer ${ver.access_token}`, 'Content-Type': 'application/json' };
  console.log(`3. ENROLL→CHALLENGE→VERIFY OK — code ${code} accepté, jeton aal=${claims2.aal}`);

  // 4. RPC admin_stats en AAL2 → doit PASSER
  const ok = await fetch(`${SB_URL}/rest/v1/rpc/admin_stats`, { method: 'POST', headers: H2, body: '{}' }).then(j);
  if (ok.code || ok.message) throw new Error('AAL2 toujours refusé !? ' + JSON.stringify(ok).slice(0, 300));
  console.log(`4. RPC admin_stats AAL2 → ACCEPTÉ ✓ (tenants=${ok.tenantCount}, users=${ok.userCount}, superAdmins=${ok.superAdminCount})`);

  // 5. Unenroll (exige AAL2 — déjà OK) → compte propre
  const un = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}`, { method: 'DELETE', headers: H2 }).then(j);
  if (un.id !== enroll.id) throw new Error('unenroll failed: ' + JSON.stringify(un).slice(0, 200));
  console.log('5. UNENROLL OK — preuve AAL2 complète: AAL1 REFUSÉ → AAL2 ACCEPTÉ ✔');
}

main().catch(async (e) => {
  console.error(e.message);
  try {
    const env2 = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const u = env2.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
    const a = env2.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];
    const l = await fetch(`${u}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: a },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).then(j);
    if (l.access_token) {
      const user = await fetch(`${u}/auth/v1/user`, { headers: { apikey: a, Authorization: `Bearer ${l.access_token}` } }).then(j);
      for (const f of user.factors ?? []) {
        const d = await fetch(`${u}/auth/v1/factors/${f.id}`, { method: 'DELETE', headers: { apikey: a, Authorization: `Bearer ${l.access_token}` } });
        console.error(`cleanup: facteur ${f.id} (HTTP ${d.status})`);
      }
    }
  } catch { /* best effort */ }
  process.exit(1);
});
