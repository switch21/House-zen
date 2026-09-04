# HOUSE-ZEN

**Plateforme SaaS professionnelle de gestion d'hôtels, résidences, auberges,
appartements meublés et établissements d'hébergement.** Multi-tenant, sécurisé
(RLS PostgreSQL), multilingue (fr, en, es, de, ar — RTL, it, sw), déployable
Vercel + Supabase.

## Démarrage rapide (mode démo)
```bash
npm install
npm run dev          # http://localhost:3000 — bannière "Mode démo"
```
Comptes de démonstration (mot de passe `demo1234`) :
`owner@` · `manager@` · `reception@` · `compta@` · `menage@` · `tech@demo.house-zen.app`
et `admin@house-zen.app` (Super Admin). Réservation publique : `/book/zen-palace-douala`.

## Production (Supabase)
```bash
cp .env.example .env.local           # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
supabase link --project-ref <ref>
supabase db push                     # 50 migrations versionnées (supabase/migrations)
npm run build && vercel deploy       # vercel.json : SPA + CSP
```

## Scripts
```bash
npm run dev          # serveur de dev (port 3000)
npm run lint         # ESLint (0 warning toléré)
npm run typecheck    # tsc strict
npm test             # Vitest (35 tests : money, RBAC, i18n, isolation, concurrence)
npm run build        # build production
```

## Architecture (résumé)
- **Frontend** : React 18 + Vite + TS strict + Tailwind + shadcn/ui + TanStack Query
  + React Hook Form + Zod + Recharts. Dossier `src/` par features.
- **Couche données** : contrat `DataApi` unique → production Supabase (RLS + RPC
  SECURITY DEFINER) ou adaptateur démo documenté (bannière visible, code mort en prod).
- **Backend** : PostgreSQL (RLS sur 100 % des tables métier), Auth PKCE, Storage
  isolé par tenant, Realtime, moteur de disponibilité unique, réservations
  atomiques anti-overbooking, factures immuables, paiements idempotents.
- **SaaS** : plans FREE→ENTERPRISE, quotas, usage, feature flags, Super Admin.

## Documentation
- `docs/implementation/` — audit initial, cartographie, statuts, décisions,
  rapports final/sécurité/performance, runbooks déploiement & backup, limitations
- `docs/api.md` — conventions REST `/api/v1` + extrait OpenAPI
- `supabase/migrations/` — 50 migrations SQL versionnées et commentées

## Sécurité — règle d'or
Le frontend n'est jamais une mesure de sécurité. Toute autorisation est appliquée
dans PostgreSQL (RLS + fonctions SECURITY DEFINER). La clé `service_role` ne doit
jamais apparaître côté client (scan CI).
