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
Super Admin) · 57 tests Vitest · 8 E2E Playwright · CI GitHub Actions ·
Realtime multi-tenant (canal + invalidation) · MFA TOTP (enrôlement + challenge) ·
Edge API v1 (dual auth, idempotence, webhooks HMAC, rate limit) ·
Edge Function notification-dispatcher (Resend/Twilio, lease, DLQ) ·
Chiffrement PII id_document (migration 052, RPC auditée) · Code-splitting par route.

### Partiellement terminées
- **Notifications sortantes** : Edge Function `notification-dispatcher` livrée
  (claim+lease SKIP LOCKED, Resend/Twilio fail-closed, backoff expo, DLQ) ;
  reste à l'exploitant : déployer la fonction + cron + secrets providers
  (runbook §DLQ).
- **REST API v1** : Edge Function `api-v1` + migration 051 (contexte machine
  transaction-local) livrés et type-checkés en CI ; déploiement réel au
  provisionnement du projet Supabase.

### Reste à faire
Connecteurs paiement Mobile Money réels (webhooks signés) · OTA ·
complétion traductions secondaires (fallback fr en place).

## Base de données
52 migrations versionnées (`202609040001`→`052`) : 45+ tables, 20+ fonctions
SECURITY DEFINER, triggers (updated_at, immuabilité factures, maintenance,
chiffrement PII), RLS sur 100 % des tables métier, index sur tous les chemins
critiques (réservations window, payments status, audit, usage, notifications
QUEUED). Counters par tenant (HZ-YYYY-NNNN). Devise XAF par défaut
configurable, NUMERIC(15,2), timestamptz.

## Sécurité
Voir security-report.md (OWASP, RLS, RBAC, Storage, headers CSP Vercel,
chiffrement PII au repos + RPC de lecture auditée, revokes sur default
privileges Supabase).

## Tests (résultats réels)
```
lint        PASS (eslint, 0 warning)
typecheck   PASS (tsc -b, strict, noUncheckedIndexedAccess)
unit        PASS 57/57 (Vitest : money, dates/overlap, rbac, i18n, realtime,
                  mfa, contrat PII)
integration PASS (adaptateur : isolation multi-tenant, machines à états, finance)
concurrency PASS (10 requêtes parallèles → 1 gagnant, 9 échecs propres)
build       PASS (vite build, ~7.5 s) — code-splitting : shell 115 kB (gzip 33 kB),
                  29 chunks de pages 1–11 kB, vendors isolés (charts chargé
                  uniquement par Dashboard/Reports)
E2E         PASS 8/8 (Playwright Chromium : auth+RBAC, booking public,
                  réservation back-office)
edge        PASS (deno check : api-v1, notification-dispatcher)
E2E manual  PASS (agent-browser : login, dashboard, 8 pages, booking public, reload)
security    PASS (scan patterns : pas de service_role/ts-ignore/dangerouslySetInnerHTML)
```

## Déploiement
Frontend → Vercel (vercel.json : SPA rewrites, CSP, cache assets) ;
Backend/DB → Supabase (`supabase db push`, 52 migrations ordonnées) ;
variables : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (anon public, RLS=barrière).
Environnements local/development/staging/production séparés (projets Supabase distincts).
Rollback : `vercel rollback` + PITR Supabase. Détails : deployment-runbook.md.

## Risques résiduels
1. Connecteurs providers notification/paiement à provisionner côté exploitant
   (dispatcher + webhook signés prêts ; en attendant : enregistrement manuel des
   paiements — déjà supporté et idempotent ; notifications IN_APP fonctionnelles).
2. MFA non activé par défaut (activation en un clic dans Supabase Auth).
3. Traductions secondaires partielles (fallback fr propre, testé).
4. Clé PII à créer avant d'appliquer la 052 sur des données existantes
   (runbook §PII ; installations fraîches : aucune action requise).
5. Le mode démo ne doit JAMAIS être utilisé en production (code mort quand Supabase
   configuré ; bannière visible sinon).
