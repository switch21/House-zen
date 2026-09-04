# HOUSE-ZEN — Cartographie d'architecture

## Vue d'ensemble
```
UX (React 18 + Vite + shadcn/ui, 7 locales, RTL ar)
        ↓
TanStack Query (cache, mutations, invalidation)
        ↓
DataApi (contrat unique — src/lib/api/types.ts)
        ↓            ↘
SupabaseDataApi      DemoDataApi (mode démo documenté, bannière visible)
(client centralisé)  (adaptateur en mémoire, seedé, sémantique identique)
        ↓
Supabase Auth (PKCE) → RLS PostgreSQL (auth.uid() → membership → tenant_id)
        ↓
RPC SECURITY DEFINER (réservation atomique, check-in/out, finance)
        ↓
Audit logs + Domain events → Notification engine
        ↓
Tests (Vitest) / CI (GitHub Actions) / Déploiement (Vercel + Supabase)
```

## Frontend (src/)
- `app/` — router (`routes.tsx`, `guards.tsx`), providers, layouts (sidebar RTL-aware), config
- `components/ui/` — primitives shadcn/ui (button, input, card, dialog, select, tabs, table…)
- `components/layout/` — PageHeader, StatCard, StatusBadge partagés
- `features/` — 24 modules métier : auth, dashboard, properties, buildings, room-types,
  rooms, amenities, rates, customers, reservations, checkins(+checkouts), services,
  housekeeping, maintenance, invoices, payments, expenses, suppliers, reports,
  notifications, settings, subscriptions, super-admin, public-booking, calendar, crud
- `hooks/` — TanStack Query keys cohérentes `['hz', entity, scope]`, mutations + invalidation
- `lib/api/` — contrat DataApi + factory (Supabase | Démo)
- `lib/auth/` — AuthContext (session, rôle, tenant)
- `lib/permissions/` — matrice RBAC (7 rôles × 43 permissions) + mapping routes
- `lib/i18n/` — cœur (fallback fr), 7 locales, RTL arabe, persistance préférence UI
- `lib/supabase/` — client unique (anon key ; service_role jamais exposé)
- `lib/demo/` — store seedé + moteur métier miroir des règles SQL
- `lib/utils/` — cn, uuid, money (cent-safe), dates (règle d'intersection §10)
- `types/` — types du domaine (miroir du schéma SQL)

## Backend (supabase/migrations/ — 50 migrations versionnées)
- **001-003** : noyau multi-tenant (tenants, profiles, memberships), audit_logs,
  domain_events, fonctions de sécurité (`hz_current_tenant_id`, `hz_has_permission`,
  `hz_audit`, `hz_emit_event`), RLS global + helper `hz_tenant_rls()`
- **004-010** : structure (properties, buildings, room_types, rooms+machines à états,
  amenities, rates/seasons/rules, Storage isolé par tenant)
- **011-016** : customers, reservations (+compteur HZ-YYYY-NNNN), items (tarif historique),
  guests, status history, **moteur de disponibilité unique** + `create_reservation_atomic`
  (FOR UPDATE + re-check + quota) + `update_reservation_status` (machine à états)
- **017-022** : checkins, `perform_checkin`/`perform_checkout` (solde impayé), checkouts,
  housekeeping (+`complete_housekeeping_task`), maintenance (+triggers), services
  (prix historique figé)
- **023-033** : tax_rates, cancellation_policies, invoices (+immuabilité par trigger),
  invoice_items (+gel après émission), payments (idempotence unique), allocations,
  webhooks (replay-safe), expenses, categories, suppliers, fonctions finance
  (`create_invoice_from_reservation`, `issue_invoice`, `void_invoice`, `record_payment`)
- **034** : vues analytiques + `dashboard_kpis` (occupancy, ADR, RevPAR)
- **035-036** : idempotency store API, api_keys (hash SHA-256, scopes)
- **037-038** : domain_events (traitement), moteur notifications (templates versionnés,
  préférences + consentement marketing séparé, deliveries + retry + dead-letter)
- **039-050** : SaaS (plans, entitlements, coupons, subscriptions, events, `change_plan`
  avec garde de downgrade, usage, feature flags, billing customers/invoices/payments,
  fonctions admin auditée, `saas_rls` (impersonation journalisée, fonctions publiques),
  seed des plans
