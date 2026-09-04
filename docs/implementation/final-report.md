# HOUSE-ZEN — Rapport final

## Fonctionnalités

### Terminées (VERIFIED — preuves en implementation-status.md)
Bootstrap complet · Multi-tenancy (RLS + RBAC 7 rôles) · Structure établissement ·
Réservations atomiques anti-overbooking · Moteur de disponibilité unique ·
Check-in/out avec contrôle de solde · Housekeeping & maintenance (machines à états
serveur) · Services à prix historique · Finance (factures immuables, paiements
idempotents, allocations, dépenses, fournisseurs) · Dashboard KPI + graphiques ·
Rapports + export CSV · Audit logs · Notifications IN_APP · i18n 7 langues + RTL ·
Réservation publique sans compte · SaaS (plans, quotas, usage, feature flags,
Super Admin) · 35 tests Vitest · CI GitHub Actions · Vérification E2E navigateur.

### Partiellement terminées
- **Moteur de notifications** : tables + machine QUEUED→SENT→DEAD_LETTER prêtes ;
  les connecteurs providers (SMTP, WhatsApp Business, SMS) restent à brancher
  (Edge Functions + secrets providers).
- **REST API v1** : schéma DB complet (api_keys, idempotency, scopes) + conventions
  et spec OpenAPI (`docs/api.md`) ; les Edge Functions de serving restent à déployer.
- **Realtime** : policies en place (le Realtime Supabase hérite du RLS) ;
  souscriptions client à intégrer dans les vues opérations.

### Reste à faire
E2E Playwright automatisés · MFA Super Admin (activation Supabase Auth) ·
connecteurs paiement Mobile Money réels (webhooks signés) · OTA.

## Base de données
50 migrations versionnées (`202609040001`→`050`) : 45+ tables, 20+ fonctions
SECURITY DEFINER, triggers (updated_at, immuabilité factures, maintenance),
RLS sur 100 % des tables métier, index sur tous les chemins critiques
(réservations window, payments status, audit, usage). Counters par tenant
(HZ-YYYY-NNNN). Devise XAF par défaut configurable, NUMERIC(15,2), timestamptz.

## Sécurité
Voir security-report.md (OWASP, RLS, RBAC, Storage, headers CSP Vercel).

## Tests (résultats réels)
```
lint        PASS (eslint, 0 warning)
typecheck   PASS (tsc -b, strict, noUncheckedIndexedAccess)
unit        PASS 35/35 (Vitest : money, dates/overlap, rbac, i18n)
integration PASS (adaptateur : isolation multi-tenant, machines à états, finance)
concurrency PASS (10 requêtes parallèles → 1 gagnant, 9 échecs propres)
build       PASS (vite build, 8.6 s, gzip 348 kB)
E2E manual  PASS (agent-browser : login, dashboard, 8 pages, booking public, reload)
security    PASS (scan patterns : pas de service_role/ts-ignore/dangerouslySetInnerHTML)
```

## Déploiement
Frontend → Vercel (vercel.json : SPA rewrites, CSP, cache assets) ;
Backend/DB → Supabase (`supabase db push`, 50 migrations ordonnées) ;
variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon public, RLS=barrière).
Environnements local/development/staging/production séparés (projets Supabase distincts).
Rollback : `vercel rollback` + PITR Supabase. Détails : deployment-runbook.md.

## Risques résiduels
1. Providers de notification et paiement non connectés (work : enregistrement manuel
   des paiements — déjà supporté et idempotent).
2. MFA non activé par défaut (activation en un clic dans Supabase Auth).
3. Traductions secondaires partielles (fallback fr propre, testé).
4. E2E automatisés à compléter (parcours critiques manuellement vérifiés).
5. Le mode démo ne doit JAMAIS être utilisé en production (code mort quand Supabase
   configuré ; bannière visible sinon).
