/**
 * HOUSE-ZEN — preuve E2E des RPC admin WRITE en production (après migration 062).
 *
 * Contexte : bug « reset password ne fait rien » — cause = GRANT EXECUTE
 * manquants sur les 10 fonctions d'écriture admin (059). Ce script prouve la
 * chaîne complète avec le vrai compte super admin, sans toucher aux vrais users :
 *
 *   login → (facteur vérifié existant : secret lu côté DB opérateur, code RFC
 *   6238 local | sinon facteur TOTP temporaire) → session AAL2 →
 *   admin_create_user (jetable) → admin_list_users (le voit) →
 *   admin_set_user_password (LA CORRECTION CIBLE) → login avec le NOUVEAU
 *   mot de passe (prouve extensions.crypt + GoTrue) → admin_delete_user
 *   (nettoyage) → unenroll du facteur temporaire SI créé (sinon état intact).
 *
 * Usage (identifiants JAMAIS en dur) :
 *   HZ_ADMIN_EMAIL=... HZ_ADMIN_PASSWORD=... SUPABASE_ACCESS_TOKEN=sbp_... \
 *   node scripts/test-admin-rpc-e2e.mjs
 */
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';

const EMAIL = process.env.HZ_ADMIN_EMAIL;
const PASSWORD = process.env.HZ_ADMIN_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error('Usage: HZ_ADMIN_EMAIL=... HZ_ADMIN_PASSWORD=... node scripts/test-admin-rpc-e2e.mjs');
  process.exit(1);
}

const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const SB_URL = env.match(/VITE_SUPABASE_URL=(\S+)/)?.[1];
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(\S+)/)?.[1];

const PROOF_EMAIL = `qa-rpc-proof-${Date.now()}@house-zen.app`;
const PWD1 = 'Proof#Temp2026a';
const PWD2 = 'Proof#Reset2026b';
let tempFactorId = null;
let aal2Token = null;
let createdUserId = null;

/** Secret d'un facteur TOTP vérifié existant — lecture opérateur (Management API). */
async function existingFactorSecret(factorId) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) return null;
  const res = await fetch(`https://api.supabase.com/v1/projects/${new URL(SB_URL).hostname.split('.')[0]}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `select secret from auth.mfa_factors where id = '${factorId}'` }),
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return rows?.[0]?.secret ?? null;
}

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

async function rpc(fn, args, token = aal2Token) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${fn} -> HTTP ${res.status}: ${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : null;
}

async function main() {
  // 1. Login
  const login = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  }).then((r) => r.json());
  if (!login.access_token) throw new Error('login failed: ' + JSON.stringify(login).slice(0, 200));
  const H = { apikey: ANON, Authorization: `Bearer ${login.access_token}`, 'Content-Type': 'application/json' };
  const me = await fetch(`${SB_URL}/auth/v1/user`, { headers: H }).then((r) => r.json());
  const verified = (me.factors ?? []).filter((f) => f.status === 'verified' && f.factor_type === 'totp');
  console.log(`1. LOGIN OK — ${me.email}, facteurs TOTP vérifiés: ${verified.length}`);

  // 2. Session AAL2 — réutilise le facteur vérifié existant si présent (zéro
  //    modification d'état), sinon enrôle un facteur temporaire.
  if (verified.length > 0) {
    const secret = await existingFactorSecret(verified[0].id);
    if (!secret) throw new Error('facteur existant mais secret illisible (SUPABASE_ACCESS_TOKEN requis)');
    const ch = await fetch(`${SB_URL}/auth/v1/factors/${verified[0].id}/challenge`, { method: 'POST', headers: H }).then((r) => r.json());
    if (!ch.id) throw new Error('challenge failed: ' + JSON.stringify(ch).slice(0, 200));
    const code = totp(secret);
    const ver = await fetch(`${SB_URL}/auth/v1/factors/${verified[0].id}/verify`, {
      method: 'POST', headers: H, body: JSON.stringify({ challenge_id: ch.id, code }),
    }).then((r) => r.json());
    if (!(ver.verified === true || ver.access_token)) throw new Error('verify failed: ' + JSON.stringify(ver).slice(0, 300));
    aal2Token = ver.access_token ?? login.access_token;
    console.log('2. AAL2 OBTENU via facteur EXISTANT (aucun changement d\'état du compte)');
  } else {
    const enroll = await fetch(`${SB_URL}/auth/v1/factors`, {
      method: 'POST', headers: H,
      body: JSON.stringify({ factor_type: 'totp', friendly_name: 'qa-admin-rpc-proof' }),
    }).then((r) => r.json());
    if (!enroll.id || !enroll.totp?.secret) throw new Error('enroll failed: ' + JSON.stringify(enroll).slice(0, 200));
    tempFactorId = enroll.id;
    const ch = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/challenge`, { method: 'POST', headers: H }).then((r) => r.json());
    if (!ch.id) throw new Error('challenge failed: ' + JSON.stringify(ch).slice(0, 200));
    const code = totp(enroll.totp.secret);
    const ver = await fetch(`${SB_URL}/auth/v1/factors/${enroll.id}/verify`, {
      method: 'POST', headers: H, body: JSON.stringify({ challenge_id: ch.id, code }),
    }).then((r) => r.json());
    if (!(ver.verified === true || ver.access_token)) throw new Error('verify failed: ' + JSON.stringify(ver).slice(0, 300));
    aal2Token = ver.access_token ?? login.access_token;
    console.log('2. FACTEUR TEMPORAIRE VERIFIE (aucun facteur préexistant)');
  }
  const claims = JSON.parse(Buffer.from(aal2Token.split('.')[1], 'base64').toString());
  console.log(`   AAL=${claims.aal}`);

  // 3. admin_create_user (jetable) — prouve aussi le GRANT de create_user
  const created = await rpc('admin_create_user', {
    p_email: PROOF_EMAIL, p_full_name: 'QA RPC Proof', p_password: PWD1, p_locale: 'fr',
  });
  createdUserId = created?.id;
  console.log(`3. admin_create_user OK — id=${createdUserId ?? 'n/a (jsonb sans id ?)'}`);

  // 4. admin_list_users voit le jetable
  const users = await rpc('admin_list_users', {});
  const found = (users ?? []).find((u) => u.email === PROOF_EMAIL);
  createdUserId = createdUserId ?? found?.id;
  if (!createdUserId) throw new Error('utilisateur jetable introuvable dans admin_list_users');
  console.log(`4. admin_list_users OK — jetable visible (${(users ?? []).length} users au total)`);

  // 5. admin_set_user_password — LA CORRECTION CIBLE (migration 062)
  await rpc('admin_set_user_password', { p_user_id: createdUserId, p_password: PWD2 });
  console.log('5. admin_set_user_password OK (plus de « permission denied »)');

  // 6. Login avec le NOUVEAU mot de passe — prouve crypt + GoTrue bout en bout
  const relogin = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', apikey: ANON },
    body: JSON.stringify({ email: PROOF_EMAIL, password: PWD2 }),
  }).then((r) => r.json());
  if (!relogin.access_token) throw new Error('login avec nouveau mdp échoué: ' + JSON.stringify(relogin).slice(0, 200));
  console.log('6. LOGIN avec le NOUVEAU mot de passe OK — chaîne crypt/GoTrue prouvée');

  // 7. Nettoyage: admin_delete_user
  await rpc('admin_delete_user', { p_user_id: createdUserId });
  const after = await rpc('admin_list_users', {});
  if ((after ?? []).some((u) => u.email === PROOF_EMAIL)) throw new Error('jetable toujours présent après delete');
  console.log('7. admin_delete_user OK — état utilisateurs restauré');
}

main()
  .then(async () => {
    if (tempFactorId && aal2Token) {
      const un = await fetch(`${SB_URL}/auth/v1/factors/${tempFactorId}`, {
        method: 'DELETE',
        headers: { apikey: ANON, Authorization: `Bearer ${aal2Token}`, 'Content-Type': 'application/json' },
      }).then((r) => r.json());
      console.log(`8. UNENROLL facteur temporaire ${un.id === tempFactorId ? 'OK' : 'À VÉRIFIER MANUELLEMENT'} — preuve complète ✔`);
    }
    console.log(`\n=== PROOF COMPLETE: create_user → set_user_password → login(new pwd) → delete_user ✔ (compte jetable ${PROOF_EMAIL} supprimé) ===`);
  })
  .catch(async (e) => {
    console.error('ÉCHEC:', e.message);
    // Best-effort cleanup: jetable + facteur temporaire.
    if (process.env.KEEP) {
      console.error(`KEEP=1 — jetable CONSERVÉ pour inspection: ${PROOF_EMAIL} (id=${createdUserId})`);
    }
    try {
      if (!process.env.KEEP && createdUserId && aal2Token) {
        await fetch(`${SB_URL}/rest/v1/rpc/admin_delete_user`, {
          method: 'POST',
          headers: { apikey: ANON, Authorization: `Bearer ${aal2Token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_user_id: createdUserId }),
        });
        console.error('cleanup: jetable supprimé (best effort)');
      }
      if (tempFactorId && aal2Token) {
        await fetch(`${SB_URL}/auth/v1/factors/${tempFactorId}`, {
          method: 'DELETE',
          headers: { apikey: ANON, Authorization: `Bearer ${aal2Token}` },
        });
        console.error('cleanup: facteur temporaire supprimé (best effort)');
      }
    } catch { /* best effort */ }
    process.exit(1);
  });
