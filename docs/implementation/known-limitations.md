# HOUSE-ZEN — Limitations connues (GO/NO-GO transparent)

1. **Mode démo** : sans credentials Supabase, l'app tourne sur l'adaptateur en
   mémoire (bannière visible). Données non persistées entre rechargements complets
   du serveur. En production (env configurées), ce code est inactif.
2. **MFA Super Admin** : supporté par Supabase Auth mais non activé par défaut —
   à activer dans Auth → Policies avant mise en production (spécification §31/§41).
3. **Notifications sortantes** : tables + machine d'états + retry/dead-letter prêts ;
   connecteurs EMAIL/SMS/WHATSAPP à brancher sur les providers (Edge Functions).
4. **Webhooks paiement** : table anti-replay + structure prêtes ; vérification de
   signature à implémenter dans l'Edge Function du provider choisi (Mobile Money…).
5. **REST API v1** : schéma (api_keys hashées, scopes, idempotency) + conventions +
   OpenAPI livrés ; le serving Edge Function reste à déployer.
6. **E2E Playwright** : parcours critiques vérifiés manuellement via agent-browser ;
   la suite automatisée est à ajouter (config + specs).
7. **Traductions es/de/ar/it/sw** : noyau couvert (>80 % des clés critiques, testé),
   fallback fr pour le reste ; complétion à planifier.
8. **Performance** : bundle 1 241 kB (gzip 348 kB) — code-splitting recommandé ;
   benchmarks de charge (100k réservations) à exécuter en staging.
9. **Chiffrement PII** : `id_document` stocké en clair en base (RLS en barrière) ;
   recommandé : chiffrement applicatif avant GO si exigence de conformité stricte.
10. **Realtime client** : souscriptions Supabase Realtime à intégrer côté UI
    (policies RLS déjà couvrantes pour l'isolation).
