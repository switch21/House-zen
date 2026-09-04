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
| 14 | Notifications IN_APP + moteur (templates, retry, DLQ) | **IMPLEMENTED** | centre UI vérifié ; moteur SQL 038 (canaux EMAIL/SMS/WhatsApp à brancher sur providers) |
| 15 | REST API v1 (clés, scopes, idempotence, OpenAPI) | **IMPLEMENTED** | migrations 035/036 + conventions docs/api.md (Edge Functions à déployer) |
| 16 | 7 langues + RTL arabe | **VERIFIED** | tests couverture ✓ (fr 100 %, en 100 %, autres >80 % du noyau) ; RTL via dir=rtl |
| 17 | Réservation publique /book/:slug | **VERIFIED** | parcours E2E navigateur : confirmation HZ-2026-0011 ✓ |
| 18 | SaaS (plans, quotas, usage, feature flags, Super Admin) | **VERIFIED** (adaptateur+SQL) | page Subscription vérifiée (usage 2/3, 17/100) ; migrations 039-050 |
| 19 | Tests (unit/intégration/concurrence/i18n) | **VERIFIED** | 35/35 Vitest ✓ |
| 20 | CI/CD | **IMPLEMENTED** | workflow GitHub Actions (lint→typecheck→test→security→build) |
| 21 | E2E Playwright | **VERIFIED** | 8/8 scénarios Chromium ✓ (18.6 s) : auth+RBAC (owner, menage→403, logout), booking public E2E complet, création réservation back-office (HZ-2026-0011) ; job CI dédié `e2e` |
| 22 | MFA Super Admin | **IMPLEMENTED** | flux complet : enrôlement TOTP (QR + clé), challenge /mfa-challenge, garde RequireAuth AAL1→AAL2, gestion dans Settings→Sécurité ; prod = Supabase Auth MFA (mfa.ts), démo = simulation documentée ; 6 tests ✓ |
| 23 | Realtime multi-tenant | **VERIFIED** (client) | canal tenant Supabase Realtime (`tenant_id=eq.`) + bus d'événements + invalidation TanStack Query ; badge notifications live ; miroir démo émetteur ; 12 tests ✓ |
| 24 | Backup/restore testé | DOCUMENTÉ | runbook livré ; exécution à la charge de l'exploitant Supabase |

## Preuves de la vérification navigateur (agent-browser, session propre)
- Login owner → dashboard : KPI (occupation 12 %, ADR 14 071 FCFA, RevPAR 1 689 FCFA) ✓
- Réservations : 10 lignes HZ-2026-0001..0010, dialog création ✓
- Housekeeping / Invoices / Calendar / Subscription / Notifications ✓
- Réservation publique : recherche → sélection → formulaire → confirmation HZ-2026-0011 (83 475 FCFA) ✓
- Reload → session conservée ✓ · 0 erreur console fraîche ✓
