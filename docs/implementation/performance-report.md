# HOUSE-ZEN — Rapport de performance

## Volumétrie cible (spécification §19) & conception
| Volume | Réponse de conception |
|---|---|
| 100 → 10 000 chambres | index `rooms_status_idx`, requêtes d'agrégation par type, pagination partout |
| 10 000 clients | index `(tenant_id, email)`, recherche serveur, pagination |
| 100 000 réservations | index `reservations_window_idx (tenant_id, check_in, check_out)` pour le moteur de disponibilité ; items indexés par room |
| 1 000 000 audit logs | table append-only indexée `(tenant_id, created_at)` ; lecture paginée 100/page |
| Dashboard | vues SQL + `dashboard_kpis` (1 RPC, agrégats SQL) ; compteurs `usage` plutôt que COUNT(*) à chaque requête (recommandation §19) |

## Mesures locales (build de production)
```
vite build       8.6 s
bundle JS        1 241 kB (gzip 348 kB) — seuil d'alerte 1200 kB franchi
bundle CSS       29.5 kB (gzip 6.1 kB)
```
**Action recommandée** : code-splitting par feature (`React.lazy` sur les pages) et
`manualChunks` (recharts, supabase) — voir known-limitations.

## Requêtes critiques (plans attendus)
- Disponibilité : anti-join `reservation_items × reservations` sur index window —
  O(chambres + réservations chevauchantes) ; valider avec `EXPLAIN ANALYZE` après
  chargement des volumes de test (script `scripts/seed-perf.sql` à produire).
- `create_reservation_atomic` : verrou ligne sur `rooms` → sérialisation sur la
  chambre ciblée uniquement (pas de goulot global) ; `hz_counters` par tenant.
- Dashboard : 1 RPC, agrégats en base, pas de N+1.

## Frontend
TanStack Query : staleTime 15 s, retry 1, invalidation ciblée par entité — évite
les refetch en cascade. Recharts borné à 14 points par série. Tables paginées
(100/page par défaut) avec scroll horizontal contrôlé.

## À mesurer en staging (charges §19)
`EXPLAIN (ANALYZE, BUFFERS)` sur : recherche disponibilité 1 an, dashboard 100k
réservations, export CSV 10k lignes, liste audit 1M lignes. Seuils : p95 < 300 ms
disponibilité, < 800 ms dashboard.
