# HOUSE-ZEN — Runbook de déploiement

## Architecture cible (spec §22)
Frontend → Vercel · Backend/DB/Auth/Storage/Realtime → Supabase · Domaine + HTTPS.

## Prérequis
- Comptes : Vercel, Supabase (projets séparés par environnement : development,
  staging, production — jamais de mélange de données).
- CLI : `supabase` (link + db push), `vercel`.
- Secrets Vercel : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
  (anon = public par design ; la barrière est le RLS — ne JAMAIS y mettre service_role).

## Procédure — nouvel environnement
```bash
# 1. Supabase : créer le projet, récupérer URL + anon key
supabase link --project-ref <ref>
supabase db push                      # applique les 50 migrations dans l'ordre

# 2. Auth : activer Email/Password ; activer MFA (TOTP) pour les super admins ;
#    configurer Site URL + redirects PKCE (https://<domaine>/auth/callback)

# 3. Storage : buckets créés par la migration 010 (property-media, privé)

# 4. Vercel : importer le repo (framework Vite) ; renseigner les env vars ;
#    vercel.json fournit rewrites SPA + CSP + cache assets

# 5. Smoke tests : /login (owner) → dashboard KPI → créer une réservation →
#    /book/<slug-public> → réservation sans compte → vérifier audit_logs
```

## CI/CD (spec §23)
GitHub Actions : install → lint → typecheck → tests → security checks → build.
Toute étape critique en échec bloque le déploiement (job deploy séparé, à brancher
sur Vercel via VERCEL_TOKEN).

## Rollback
- Frontend : `vercel rollback <deployment>` (instantané, les builds sont immuables).
- DB : PITR Supabase (voir backup-restore-runbook) ; les migrations sont additives
  (expand/contract) — jamais de migration destructive sans plan (analyse → backup →
  plan → migration → validation, spec §24).

## Post-déploiement (vérifications)
1. `/app/*` : login OK, dashboard KPI non vides.
2. Créer réservation sur dates chevauchantes → 2e tentative échoue proprement.
3. RLS : requête SQL anon sur une table métier → 0 ligne.
4. Audit : chaque action sensible apparaît dans /app/audit.
5. Realtime : activer la réplication Supabase Realtime sur les tables ops si utilisée.
