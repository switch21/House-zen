# HOUSE-ZEN — Rapport d'audit initial

Date : 2026-09-04 · Exécuté conformément à la règle absolue n°1 du prompt maître.

## Méthode
Clonage réel du dépôt `https://github.com/switch21/House-zen` + inspection complète :
arborescence, package.json, tsconfig, Vite, Tailwind, shadcn/ui, routes, composants,
hooks, contextes, stores, services, API, client Supabase, migrations, fonctions
PostgreSQL, Edge Functions, RLS, Auth, Storage, Realtime, tests, variables
d'environnement, scripts, CI/CD, configuration Vercel, documentation.

## Constat
**Le dépôt est entièrement vide** : 0 commit, 0 branche, 0 fichier.

Recherche des marqueurs (`TODO`, `FIXME`, `any`, `@ts-ignore`, `@ts-nocheck`,
`dangerouslySetInnerHTML`, `innerHTML`, `localStorage`, `sessionStorage`, `fetch(`,
`supabase`, `tenant_id`, `auth.uid()`, `SECURITY DEFINER`, `service_role`) : aucun
résultat — aucun code à auditer, aucune implémentation locale/mockée/hardcodée
à identifier, aucune donnée existante à conserver/migrer (règle §25 non applicable).

## État par fonctionnalité (grille du prompt)

| Domaine | Statut initial |
|---|---|
| Bootstrap (React/Vite/TS/Tailwind/shadcn) | NOT_STARTED |
| Supabase / Auth / Multi-tenancy / RLS / RBAC | NOT_STARTED |
| Structure établissement (properties→rates) | NOT_STARTED |
| Clients / Réservations / Disponibilité | NOT_STARTED |
| Opérations (check-in/out, housekeeping, maintenance, services) | NOT_STARTED |
| Finance (taxes, factures, paiements, dépenses, fournisseurs) | NOT_STARTED |
| Dashboard / Reporting / Audit | NOT_STARTED |
| REST API | NOT_STARTED |
| Notifications | NOT_STARTED |
| Multilingue / RTL (7 langues) | NOT_STARTED |
| Réservation publique | NOT_STARTED |
| SaaS / Abonnements | NOT_STARTED |
| Hardening / Production / Tests | NOT_STARTED |

Aucun statut `VERIFIED` n'a été posé à ce stade (règle : jamais sans preuve).

## Cartographie d'architecture (post-décision)
Dépôt vide ⇒ construction from-zero selon l'architecture cible exacte du prompt :
React 18 + Vite + TS strict + Tailwind + shadcn/ui + TanStack Query + RHF + Zod +
Recharts + Supabase (PostgreSQL, Auth, Storage, Realtime, RLS) + Vercel.
Voir `architecture-map.md` et `architecture-decisions.md`.
