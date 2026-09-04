/**
 * HOUSE-ZEN — preuve E2E que le TOTP est fonctionnel ET branché sur Supabase.
 * Cycle complet avec le compte owner réel (production):
 *   enroll (Supabase génère le secret) → challenge → verify (code TOTP calculé
 *   localement, RFC 6238) → facteur vérifié → unenroll (compte laissé propre).
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

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
  // 1. Login owner
  const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: 'owner@house-zen.app', password: 'ZM!E@MXHV676Cx3MWk9' }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  const H = { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
  console.log('1. LOGIN OK');

  // 2. Enroll TOTP — Supabase génère le secret côté serveur (POST /factors,
  //    endpoints auth-js v2 — les anciens /mfa/* répondent 404 sur ce GoTrue)
  const enroll = await fetch(`${SB_URL}/auth/v1/factors`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ factor_type: 'totp', friendly_name: 'e2e-proof' }),
  }).then((r) => r.json());
  if (!enroll.id || !enroll.totp?.secret) throw new Error('enroll failed: ' + JSON.stringify(enroll).slice(0, 200));
  console.log('2. ENROLL OK — factor:', enroll.id, '| secret émis par Supabase (base32,', enroll.totp.secret.length, 'car.)');

  // 3. Challenge + verify avec un code calculé depuis le secret serveur
  const challenge = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/challenge`, {
    method: 'POST', headers: H, body: JSON.stringify({}),
  }).then((r) => r.json());
  if (!challenge.id) throw new Error('challenge failed: ' + JSON.stringify(challenge).slice(0, 200));
  console.log('3. CHALLENGE OK');

  const code = totp(enroll.totp.secret);
  // micro-attente pour éviter toute dérive de fenêtre
  await new Promise((r) => setTimeout(r, 800));
  const verify = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/verify`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ challenge_id: challenge.id, code }),
  }).then((r) => r.json());
  if (verify.error || !verify.access_token) throw new Error('verify failed: ' + JSON.stringify(verify).slice(0, 200));
  console.log('4. VERIFY OK — code TOTP', code, 'accepté par Supabase, session AAL élevée:', verify.amr?.map((a) => a.method).join('+') ?? '(n/a)');

  // 5. Le facteur est maintenant "verified" (liste via GET /auth/v1/user)
  const user = await fetch(`${SB_URL}/auth/v1/user`, { headers: H }).then((r) => r.json());
  const mine = (user.factors ?? []).filter((f) => f.id === enroll.id);
  console.log('5. FACTEURS:', JSON.stringify(mine.map((f) => ({ id: f.id.slice(0, 8), status: f.status }))));

  // 6. Unenroll — on ne laisse AUCUN facteur actif sur le compte owner
  const unenroll = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}`, {
    method: 'DELETE', headers: H, body: JSON.stringify({}),
  }).then((r) => r.json());
  console.log('6. UNENROLL OK', JSON.stringify(unenroll).slice(0, 80));
  console.log('\n✅ TOTP 100% FONCTIONNEL ET LIÉ À SUPABASE AUTH (vérifié en production).');
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
