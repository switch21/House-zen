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
aucun mot de passe/token/clé dans les logs ; `id_document` stocké tel quel
(recommandation : chiffrement applicatif avant GO production, voir limitations).
