# HOUSE-ZEN — Rapport de sécurité

## Modèle de menace (extrait)
Attaquant = client d'un tenant A tentant d'accéder aux données du tenant B ;
visiteur public tentant de manipuler prix/disponibilité ; utilisateur légitime
tentant une élévation de privilège horizontale (autre rôle du même tenant).

## OWASP Top 10 — couverture
| Risque | Mesure |
|---|---|
| A01 Broken Access Control | RLS sur 100 % des tables métier, résolution tenant serveur (`hz_current_tenant_id`), RBAC serveur (`hz_has_permission`), mutations via RPC SECURITY DEFINER, UI = UX seulement |
| A02 Cryptographic Failures | HTTPS partout (Vercel/Supabase), PKCE auth flow, api_keys stockées en SHA-256 (`digest`), aucun secret en clair |
| A03 Injection | Requêtes paramétrées supabase-js ; SQL paramétré (format %I pour DDL d'infra uniquement) ; Zod sur toutes les entrées formulaires ; jamais de dangerouslySetInnerHTML (scan CI) |
| A04 Insecure Design | Machines à états serveur (réservations, housekeeping, factures), immuabilité par trigger, idempotence, anti-overbooking par verrou |
| A05 Security Misconfiguration | CSP stricte (vercel.json), X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy ; service_role jamais côté client (scan CI) |
| A06 Vulnerable Components | Dépendances épinglées (^) ; `npm audit` recommandé en CI avant chaque release |
| A07 Auth Failures | Supabase Auth (PKCE, sessions persistantes, rate limiting intégré) ; MFA disponible (à activer pour /admin — limitation documentée) |
| A08 Integrity Failures | Factures immuables (triggers), webhooks : table dédoublonnée (provider,event_id) unique = anti-replay, signatures à valider en Edge Function |
| A09 Logging Failures | audit_logs append-only (who/what/when/before/after/request_id), actions admin auditées, PII exclue des logs (règle §20) |
| A10 SSRF | Pas d'appels serveur construits depuis l'input utilisateur ; domaines Supabase uniquement |

## Isolation multi-tenant (preuves)
- SQL : chaque table porte `tenant_id` + policy `tenant_id = hz_current_tenant_id()` ;
  les fonctions SECURITY DEFINER re-vérifient le tenant ET la permission.
- Frontend : le tenant n'est JAMAIS lu depuis le client pour l'autorisation.
- Tests : lecture/écriture/suppression cross-tenant rejetées (isolation-concurrency.test.ts).

## Réservation publique (surface anon)
Fonctions SQL dédiées exposées à `anon` (`public_property_details`,
`public_search_availability`, `public_create_booking`) : surface minimale,
prix/stock toujours recalculés serveur, idempotence, re-check d'overlap dans la
même transaction. Aucune lecture directe de table pour anon (policy explicite false).

## Secrets & PII
`.env` git-ignoré ; `.env.example` documente les variables publiques ;
aucun mot de passe/token/clé dans les logs.

**Chiffrement PII — LIVRÉ (migration 052)** : `id_document` (tables `customers`
et `reservation_guests`) est chiffré au repos par triggers BEFORE (pgcrypto
`pgp_sym_encrypt` AES-256, préfixe `hzenc.v1:` idempotent), backfill inclus.
- Clé : jamais en dur — GUC transaction-local `hz.pii_key` ou secret Vault
  Supabase `hz_pii_key` ; résolution fail-closed (`hz_pii_key()` lève si absente,
  aucune clé dérivée/inventée).
- Fonctions internes (`hz_pii_key`, `hz_encrypt_pii`, `hz_decrypt_pii`) :
  execute révoqué à public/anon/authenticated/service_role (défense contre les
  default privileges Supabase) — appelables uniquement depuis le code
  SECURITY DEFINER.
- Lecture en clair : uniquement la RPC `hz_read_id_document(entity, id)`
  (allowlist d'entités, permission `customers.read`/`reservations.read`
  résolue pour JWT et contexte machine `hz.api_role`, `select *` ne retourne
  jamais du clair) ; chaque succès écrit `pii.id_document.read` dans
  audit_logs ; chaque refus lève 42501 (visible dans les logs PostgreSQL —
  un INSERT d'audit suivi d'un RAISE serait annulé par le rollback, choix
  documenté).
- Miroir démo : simulation documentée (données en mémoire, garde d'authentification
  identique), contrat `DataApi.readIdDocument` testé (4 specs).

## Durcissements livraison (itération hardening)
- Supabase default privileges neutralisés pour les nouvelles fonctions
  sensibles (revoke explicites anon/authenticated/service_role).
- Edge Function `notification-dispatcher` : file sortante fail-closed — sans
  provider configuré, un envoi est impossible (PROVIDER_NOT_CONFIGURED →
  retry → DEAD_LETTER) ; surface HTTP service-role/CRON uniquement ;
  garantie at-least-once documentée (lease 5 min, SKIP LOCKED, updates
  gardés `WHERE status='QUEUED'`).
