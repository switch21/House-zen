/** Injects the admin MFA-gate i18n keys into fr + en (idempotent). */
import { readFileSync, writeFileSync } from 'node:fs';

const KEYS = {
  fr: {
    'admin.mfaGate.title': 'Vérification en deux étapes requise',
    'admin.mfaGate.subtitle': 'Sécurité renforcée du back-office plateforme',
    'admin.mfaGate.explanation':
      "L'accès aux fonctions d'administration exige une session vérifiée par double authentification (TOTP). Activez la double authentification ci-dessous — elle sera ensuite demandée à chaque connexion.",
    'admin.mfaGate.navSecurity': 'Sécurité',
    'admin.mfaGate.securityTitle': 'Sécurité du compte',
    'admin.mfaGate.securitySubtitle': 'Double authentification (TOTP) — gestion des facteurs',
  },
  en: {
    'admin.mfaGate.title': 'Two-step verification required',
    'admin.mfaGate.subtitle': 'Platform back-office security gate',
    'admin.mfaGate.explanation':
      'Admin functions require a session verified by two-factor authentication (TOTP). Enable it below — it will then be requested at every sign-in.',
    'admin.mfaGate.navSecurity': 'Security',
    'admin.mfaGate.securityTitle': 'Account security',
    'admin.mfaGate.securitySubtitle': 'Two-factor authentication (TOTP) — factor management',
  },
};

for (const [loc, dict] of Object.entries(KEYS)) {
  const path = new URL(`../src/lib/i18n/locales/${loc}.ts`, import.meta.url);
  let src = readFileSync(path, 'utf8');
  let added = 0;
  for (const [k, v] of Object.entries(dict)) {
    if (src.includes(`'${k}':`)) continue;
    // insert right before the final closing line `};`
    const idx = src.lastIndexOf('};');
    src = src.slice(0, idx) + `  '${k}': ${JSON.stringify(v)},\n` + src.slice(idx);
    added++;
  }
  writeFileSync(path, src);
  console.log(`${loc}: +${added} clé(s)`);
}
