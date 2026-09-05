/**
 * HOUSE-ZEN — preuve E2E que le TOTP est fonctionnel ET branché sur Supabase.
 * Cycle complet avec un compte réel (production):
 *   login → enroll (Supabase génère le secret) → challenge → verify (code TOTP
 *   calculé localement, RFC 6238) → facteur vérifié → unenroll (compte propre).
 *
 * Usage (identifiants JAMAIS en dur dans le repo) :
 *   HZ_TOTP_EMAIL=... HZ_TOTP_PASSWORD=... node scripts/test-totp-e2e.mjs
 * (.env.local doit contenir VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY)
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.HZ_TOTP_EMAIL;
const PASSWORD = process.env.HZ_TOTP_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Usage: HZ_TOTP_EMAIL=... HZ_TOTP_PASSWORD=... node scripts/test-totp-e2e.mjs');
  process.exit(1);
}

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SB_URL = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];

// --- RFC 6238 TOTP (SHA-1, 6 digits, 30 s) ------------------------------------
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
function totp(secretB32, t = Math.floor(Date.now() / 30000)) {
  const key = base32Decode(secretB32);
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(t / 2 ** 32), 0);
  buf.writeUInt32BE(t % 2 ** 32, 4);
  const hmac = createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24 | hmac[offset + 1] << 16 | hmac[offset + 2] << 8 | hmac[offset + 3]) % 1e6;
  return String(code).padStart(6, '0');
}

async function main() {
  // 1. Login
  const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  const H = { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
  console.log('1. LOGIN OK');

  // 2. Enroll TOTP — Supabase génère le secret côté serveur (POST /factors,
  //    endpoints auth-js v2 — les anciens /mfa/* répondent 404 sur ce GoTrue)
  const enroll = await fetch(`${SB_URL}/auth/v1/factors`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'qa-proof' }),
  }).then((r) => r.json());
  if (!enroll.id || !enroll.totp?.secret) throw new Error('enroll failed: ' + JSON.stringify(enroll).slice(0, 200));
  console.log('2. ENROLL OK — secret base32 reçu (' + enroll.totp.secret.length + ' chars)');

  // 3. Challenge + verify avec le code RFC 6238 calculé localement
  const ch = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/challenge`, {
    method: 'POST', headers: H,
  }).then((r) => r.json());
  if (!ch.id) throw new Error('challenge failed: ' + JSON.stringify(ch).slice(0, 200));
  const code = totp(enroll.totp.secret);
  const ver = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/verify`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ challenge_id: ch.id, code }),
  }).then((r) => r.json());
  // GoTrue v2 renvoie une NOUVELLE session JWT (aal2) : access_token + refresh_token.
  const verified = ver.verified === true || Boolean(ver.access_token);
  if (!verified) throw new Error('verify failed: ' + JSON.stringify(ver).slice(0, 300));
  const claims = ver.access_token ? JSON.parse(Buffer.from(ver.access_token.split('.')[1], 'base64').toString()) : {};
  console.log(`3. CHALLENGE + VERIFY OK — code ${code} accepté, facteur VERIFIED, AAL=${claims.aal ?? 'n/a'}`);

  // 4. Unenroll — nécessite une session AAL2 : on réutilise le NOUVEAU token
  //    renvoyé par verify (GoTrue : "AAL2 required to unenroll verified factor").
  const H2 = { apikey: ANON, Authorization: `Bearer ${ver.access_token ?? login.access_token}`, 'Content-Type': 'application/json' };
  const un = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}`, {
    method: 'DELETE', headers: H2,
  }).then((r) => r.json());
  if (un.id !== enroll.id) throw new Error('unenroll failed: ' + JSON.stringify(un).slice(0, 200));
  console.log('4. UNENROLL OK — TOTP preuve complète: ENROLL→CHALLENGE→VERIFY→UNENROLL ✔');
}

main().catch(async (e) => {
  console.error(e.message);
  // Filet de sécurité : supprime tout facteur orphelin laissé par un run interrompu.
  try {
    const env2 = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
    const u = env2.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
    const a = env2.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];
    const login = await fetch(`${u}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: a },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    }).then((r) => r.json());
    if (login.access_token) {
      const user = await fetch(`${u}/auth/v1/user`, { headers: { apikey: a, Authorization: `Bearer ${login.access_token}` } }).then((r) => r.json());
      for (const f of user.factors ?? []) {
        const del = await fetch(`${u}/auth/v1/factors/${f.id}`, { method: 'DELETE', headers: { apikey: a, Authorization: `Bearer ${login.access_token}` } });
        console.error(`cleanup: facteur orphelin ${f.id} supprimé (HTTP ${del.status})`);
      }
    }
  } catch { /* best effort */ }
  process.exit(1);
});
