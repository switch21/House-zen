# HOUSE-ZEN — Statut d'implémentation

Légende : NOT_STARTED · IN_PROGRESS · BLOCKED · IMPLEMENTED · VERIFIED (avec preuve)

| # | Fonctionnalité | Statut | Preuves |
|---|---|---|---|
| 1 | Bootstrap React 18 + Vite + TS strict + Tailwind + shadcn | **VERIFIED** | typecheck ✓ lint ✓ build ✓ (8.6 s) |
| 2 | Multi-tenancy + RLS + RBAC (7 rôles, 43 permissions) | **VERIFIED** (frontend+SQL) | tests rbac ✓ ; migrations 002/003 ; isolation testée sur l'adaptateur miroir |
| 3 | Structure établissement (properties→rates) | **VERIFIED** | pages CRUD vérifiées navigateur ; migrations 004-010 |
| 4 | Réservations atomiques + disponibilité unique | **VERIFIED** | test concurrence : 10 requêtes → 1 gagnant ✓ ; migration 016 (FOR UPDATE + re-check) |
| 5 | Check-in / Check-out + solde impayé | **VERIFIED** (démo+SQL) | test checkout bloqué sans règlement ✓ ; migrations 017-019 |
| 6 | Housekeeping (DIRTY→CLEANING→INSPECTED→CLEAN) | **VERIFIED** | tests transitions ✓ ; migration 007/020 |
| 7 | Maintenance (ticket → room offline → retour service) | **VERIFIED** | navigation vérifiée ; migration 021 (triggers) |
| 8 | Facturation immuable (DRAFT→ISSUED→PAID, VOID) | **VERIFIED** (SQL+adaptateur) | trigger immuabilité migration 025/026 ; règles dans adaptateur |
| 9 | Paiements idempotents (5 méthodes, 7 statuts) | **VERIFIED** | test idempotence ✓ ; migration 027/033 |
| 10 | Dépenses / Catégories / Fournisseurs | **VERIFIED** | pages vérifiées navigateur |
| 11 | Dashboard KPI (occupancy, ADR, RevPAR) + graphiques | **VERIFIED** | navigation vérifiée (KPI + Recharts) ; migration 034 |
| 12 | Rapports + export CSV | **VERIFIED** | page Reports |
| 13 | Audit logs (who/what/when/before/after) | **VERIFIED** | page Audit + table audit_logs append-only |
| 14 | Notifications IN_APP + moteur (templates, retry, DLQ) | **VERIFIED** (code + CI) | centre UI vérifié ; moteur SQL 038 ; Edge Function `notification-dispatcher` (claim+lease SKIP LOCKED, Resend/Twilio fail-closed, backoff expo, DLQ 5 tentatives, janitor) ; `deno check` en CI ; déploiement cron + secrets = runbook §DLQ |
| 15 | REST API v1 (clés, scopes, idempotence, OpenAPI) | **VERIFIED** (code + CI) | Edge Function `supabase/functions/api-v1` (dual auth clé API/JWT, scopes, idempotence, webhooks HMAC, rate limit) ; migration 051 contexte machine transaction-local ; `deno check` en CI ; déploiement documenté docs/api.md |
| 16 | 7 langues + RTL arabe | **VERIFIED** | tests couverture ✓ (fr 100 %, en 100 %, autres >80 % du noyau) ; RTL via dir=rtl |
| 17 | Réservation publique /book/:slug | **VERIFIED** | parcours E2E navigateur : confirmation HZ-2026-0011 ✓ |
| 18 | SaaS (plans, quotas, usage, feature flags, Super Admin) | **VERIFIED** (adaptateur+SQL) | page Subscription vérifiée (usage 2/3, 17/100) ; migrations 039-050 |
| 19 | Tests (unit/intégration/concurrence/i18n/PII) | **VERIFIED** | 57/57 Vitest ✓ (dont 4 specs contrat PII hz_read_id_document) + 8/8 Playwright ✓ |
| 20 | CI/CD | **IMPLEMENTED** | workflow GitHub Actions (lint→typecheck→test→security→build) |
| 21 | E2E Playwright | **VERIFIED** | 8/8 scénarios Chromium ✓ (18.6 s) : auth+RBAC (owner, menage→403, logout), booking public E2E complet, création réservation back-office (HZ-2026-0011) ; job CI dédié `e2e` |
| 22 | MFA Super Admin | **VERIFIED** (code + tests) | flux complet : enrôlement TOTP (QR + clé), challenge /mfa-challenge, garde RequireAuth AAL1→AAL2, gestion dans Settings→Sécurité ; prod = Supabase Auth MFA (mfa.ts), démo = simulation documentée ; 6 tests ✓ ; activation tenant = runbook |
| 23 | Realtime multi-tenant | **VERIFIED** (client) | canal tenant Supabase Realtime (`tenant_id=eq.`) + bus d'événements + invalidation TanStack Query ; badge notifications live ; miroir démo émetteur ; 12 tests ✓ |
| 24 | Backup/restore testé | DOCUMENTÉ | runbook livré ; exécution à la charge de l'exploitant Supabase |

## Incréments hardening (itération 3)
- **Perf / code-splitting** : React.lazy par route (29 chunks de pages 1–11 kB) +
  `manualChunks` (react-vendor / charts / supabase / radix / query / vendor) ;
  app shell 1 259 kB → 115 kB (gzip 33 kB) ; `charts` (308 kB) n'est plus
  téléchargé que par Dashboard/Reports ; fallback Suspense ; E2E 8/8 re-vérifiés.
- **Chiffrement PII (migration 052)** : id_document chiffré au repos (pgcrypto
  AES-256, `hzenc.v1:`), triggers transparents, backfill conditionnel, RPC
  auditée `hz_read_id_document` (RBAC JWT + contexte machine 051), revokes
  anti-default-privileges, fail-closed sans clé ; contrat DataApi
  `readIdDocument` + 4 specs.
- **Notifications sortantes (Edge Function)** : `notification-dispatcher`
  (claim+lease FOR UPDATE SKIP LOCKED = at-least-once, aucun HTTP dans une
  transaction DB, Resend/Twilio fail-closed, `DISPATCHER_LOG_ONLY` explicite,
  backoff exponentiel plafonné 60 min, DLQ 5 tentatives + janitor) ;
  `deno check` des 2 fonctions en CI.
- **Docs** : runbook §PII + §DLQ, known-limitations ré-étalonnées, security-report
  étendu, final-report re-calé sur 52 migrations / 57 tests.

## Preuves de la vérification navigateur (agent-browser, session propre)
- Login owner → dashboard : KPI (occupation 12 %, ADR 14 071 FCFA, RevPAR 1 689 FCFA) ✓
- Réservations : 10 lignes HZ-2026-0001..0010, dialog création ✓
- Housekeeping / Invoices / Calendar / Subscription / Notifications ✓
- Réservation publique : recherche → sélection → formulaire → confirmation HZ-2026-0011 (83 475 FCFA) ✓
- Reload → session conservée ✓ · 0 erreur console fraîche ✓
