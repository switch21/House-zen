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

## PII — clé de chiffrement (migration 052)
`id_document` (customers, reservation_guests) est chiffré au repos (pgcrypto
AES-256, préfixe `hzenc.v1:`). Le déchiffrement ne passe QUE par la RPC auditée
`hz_read_id_document` (permissions `customers.read` / `reservations.read`,
chaque accès écrit `pii.id_document.read` dans audit_logs ; les refus lèvent
42501 et se retrouvent dans les logs PostgreSQL).

- **AVANT d'appliquer la 052 sur des données existantes** : créer le secret.
  - Option Supabase recommandée : Vault → secret nommé `hz_pii_key`
    (`select vault.create_secret('<clé-aléatoire-32+ octets>', 'hz_pii_key');`).
  - Option GUC : `SET LOCAL hz.pii_key = '<clé>'` dans chaque transaction
    entrante (même pattern que `hz.tenant_id`, migration 051).
  - Sans clé, la migration s'applique mais le backfill est SKIPPÉ avec un
    WARNING (installations fraîches : aucune ligne à convertir) et
    `hz_encrypt_pii` échoue fermé (aucune clé inventée).
- Génération de clé : `openssl rand -base64 32`.
- Rotation : lire la valeur legacy, `UPDATE` la ligne — le trigger re-chiffre
  avec la clé courante ; procédure par lots hors heures pleines.
- Vérification : `select hz_read_id_document('customers', '<uuid>')` sous un
  rôle autorisé → valeur lisible + ligne `pii.id_document.read` dans audit_logs ;
  `select id_document from customers` → préfixe `hzenc.v1:` uniquement.

## DLQ — notifications sortantes (dispatcher)
- Déployer : `supabase functions deploy notification-dispatcher` puis créer un
  cron Supabase (pg_cron / Scheduler) qui POSTe sur
  `/functions/v1/notification-dispatcher` avec
  `Authorization: Bearer <DISPATCHER_CRON_SECRET>` toutes les 1–5 minutes.
- Secrets : `SUPABASE_DB_URL` ; providers : `RESEND_API_KEY`+`MAIL_FROM`
  (EMAIL), `TWILIO_ACCOUNT_SID`+`TWILIO_AUTH_TOKEN`+`TWILIO_SMS_FROM`/
  `TWILIO_WHATSAPP_FROM` (SMS/WhatsApp). Sans provider configuré, la file
  échoue FERMÉE (PROVIDER_NOT_CONFIGURED → retry → DLQ) — jamais d'envoi simulé
  en production. Staging uniquement : `DISPATCHER_LOG_ONLY=1`.
- Garanties : at-least-once (lease 5 min, SKIP LOCKED) ; backoff exponentiel
  plafonné à 60 min ; DEAD_LETTER après 5 tentatives ; balayage janitor des
  tentatives finales interrompues par crash.
- Supervision : `select count(*) from notification_deliveries where
  status='DEAD_LETTER'` → alerte si > 0 ; inspection des causes dans
  `errors` retournés par le dispatcher et les logs Edge.
