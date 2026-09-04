# HOUSE-ZEN — Décisions d'architecture

## AD-01 — Stack : Vite + React 18 (et non Next.js) · ACCEPTÉE
Le prompt maître exige explicitement React 18 + Vite + Supabase/PostgreSQL (RLS,
Auth, Storage, Realtime) avec déploiement Vercel. La plateforme d'exécution locale
propose un gabarit Next.js/Prisma/SQLite, mais Prisma/SQLite ne fournit ni RLS ni
les RPC atomiques requis par la spécification. La spécification client prime.

## AD-02 — Adaptateur démo documenté (jamais silencieux) · ACCEPTÉE
Aucune credential Supabase n'a été fournie (règle §38 : ne jamais en inventer).
Décision : architecture Repository (contrat `DataApi`) avec deux implémentations —
production Supabase (migrations + RPC) et adaptateur démo en mémoire **explicitement
signalé** (bannière permanente « Mode démo », section login dédiée, documentation).
Conforme à la règle §26 : la logique locale est volontaire et visible ; en production
(`VITE_SUPABASE_URL` renseigné) l'adaptateur est du code mort.

## AD-03 — Sémantique d'isolation miroir · ACCEPTÉE
L'adaptateur démo réplique exactement la sémantique serveur : chaque ligne porte
`tenant_id`, chaque accès est scopé par la session, la création de réservation est
atomique (aucun `await` entre le re-check d'overlap et l'écriture — équivalent
event-loop du `FOR UPDATE` + re-check SQL). Les tests de concurrence/isolation
valident ces invariants sur l'adaptateur ; les mêmes invariants sont garantis en
SQL par les migrations 002/003/016.

## AD-04 — Moteur de disponibilité unique · ACCEPTÉE (spécification §10)
Un seul point d'entrée : `search_available_room_types` (SQL) / `searchAvailableRoomTypes`
(adaptateur). Le back-office, le calendrier et le widget public l'appellent ; aucune
logique concurrente ne sera tolérée (future OTA incluse).

## AD-05 — Réservation publique sans compte · ACCEPTÉE (PHASE 11)
Le visiteur réserve sans compte : un `Customer` léger est créé/réutilisé, la clé
d'idempotence évite les doubles soumissions, les prix sont **toujours recalculés
côté serveur** (`compute_quote`/`publicCreateBooking`). En SQL, la fonction
`public_create_booking` s'exécute SECURITY DEFINER avec re-check d'overlap.

## AD-06 — Immuabilité financière par triggers · ACCEPTÉE (spec §14)
Les factures émises sont gelées au niveau PostgreSQL (triggers 025/026) : aucune
modification des montants, seulement `amount_paid` via `record_payment`. Correction
= void + nouvelle facture (avoir). L'adaptateur démo applique les mêmes règles.

## AD-07 — i18n : fr base, couverture dégressive documentée · ACCEPTÉE (PHASE 10)
fr et en : couverture 100 % (testée). es/de/ar/it/sw : noyau navigation/actions
(>80 % des clés critiques, testé) avec fallback fr — jamais de chaîne vide, jamais
de clé brute à l'écran. Complétion via `src/lib/i18n/locales/*`.

## AD-08 — Session démo en sessionStorage · ACCEPTÉE
En mode démo, la session est persistée en sessionStorage (convenience UI, règle §26 —
cache non critique). En production, Supabase Auth gère la session (persistSession,
PKCE) ; le code de démo est inactif.

## AD-09 — Impersonation : auditée, non activée · ACCEPTÉE (spec §31)
Le Super Admin peut suspendre/réactiver des tenants et basculer des feature flags
(audité). L'impersonation reste un stub **désactivé et journalisé**
(`admin_impersonation_attempt`) — son implémentation complète exige des Edge
Functions émettant un JWT scopé ; activée par défaut = risque inutile.
