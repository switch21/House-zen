# HOUSE-ZEN — Limitations connues (GO/NO-GO transparent)

1. **Mode démo** : sans credentials Supabase, l'app tourne sur l'adaptateur en
   mémoire (bannière visible). Données non persistées entre rechargements complets
   du serveur. En production (env configurées), ce code est inactif.
2. **MFA Super Admin** : supporté par Supabase Auth mais non activé par défaut —
   à activer dans Auth → Policies avant mise en production (spécification §31/§41).
3. **Notifications sortantes** : tables + machine d'états + retry/dead-letter +
   **Edge Function `notification-dispatcher` livrée** (Resend/Twilio, lease
   SKIP LOCKED, backoff, DLQ, fail-closed sans provider). Reste à l'exploitant :
   déployer la fonction, créer le cron, renseigner les secrets providers
   (deployment-runbook §DLQ).
4. **Webhooks paiement** : table anti-replay + structure prêtes ; vérification de
   signature à implémenter dans l'Edge Function du provider choisi (Mobile Money…).
5. **REST API v1** : schéma (api_keys hashées, scopes, idempotency) + conventions
   + OpenAPI + Edge Function `api-v1` (dual auth, rate limit, webhooks HMAC)
   livrés ; déploiement réel à faire au provisionnement du projet Supabase.
6. **Traductions es/de/ar/it/sw** : noyau couvert (>80 % des clés critiques, testé),
   fallback fr pour le reste ; complétion à planifier.
7. **Performance** : code-splitting par route livré (shell 115 kB gzip 33 kB,
   29 chunks de pages 1–11 kB, charts isolés 308 kB chargés uniquement par
   Dashboard/Reports, supabase 104 kB) ; vendors React regroupés en un chunk
   unique `vendor` 537 kB (gzip 171 kB) — éclatement inter-chunks interdit :
   les cycles d'évaluation Rollup produisent une page blanche silencieuse en
   production (`forwardRef` undefined, cf. vite.config.ts §bundle strategy) ;
   benchmarks de charge (100k réservations) à exécuter en staging.
8. **Chiffrement PII** : **livré (migration 052)** — `id_document` chiffré au
   repos (pgcrypto AES-256), lecture uniquement via RPC auditée
   `hz_read_id_document` (RBAC + audit_logs). Reste à l'exploitant : créer la
   clé (`hz_pii_key` Vault ou GUC) AVANT d'appliquer la 052 sur des données
   existantes (runbook §PII) et activer la rotation documentée.
9. **E2E Playwright** : suite automatisée livrée (8 scénarios : auth/RBAC,
   booking public, réservation back-office) ; le parcours de vérification
   manuelle agent-browser reste documenté dans implementation-status.
10. **Realtime client** : intégration livrée (canal tenant + invalidation de
    requêtes + badge live) ; réplication Supabase Realtime à activer par
    l'exploitant sur les tables ops (runbook post-déploiement).
