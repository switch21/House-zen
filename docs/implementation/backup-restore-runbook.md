# HOUSE-ZEN — Runbook backup / restauration

## Stratégie (backup + retention + restore + validation — spec §21)
| Élément | Cible |
|---|---|
| Backup automatique | Supabase PITR (WAL, fenêtre 7 j selon plan) + dump logique hebdomadaire |
| RPO | ≤ 5 minutes (PITR) |
| RTO | ≤ 1 heure (restauration + smoke tests) |
| Rétention dumps | 30 jours (4 hebdo + 2 mensuels hors site) |
| Storage fichiers | Buckets Supabase — réplication gérée ; dump des métadonnées inclus |

## Backup hebdomadaire (à planifier côté exploitant)
```bash
pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=6 \
  --file="house-zen-$(date +%Y%m%d).dump" \
  --exclude-data=payment_webhooks   # volumétrie froide, régénérable
# Chiffrer puis pousser hors site (S3/GCS chiffré)
age -r "$RECIPIENT_KEY" house-zen-*.dump > house-zen-*.dump.age
```

## Restauration (procédure validée avant GO)
```bash
# 1. Provisionner un projet Supabase vierge (jamais restaurer par-dessus la prod)
supabase link --project-ref <new-ref>
supabase db push                     # schéma via les 50 migrations

# 2. Restaurer les données
pg_restore --clean --if-exists --no-owner \
  -d "$NEW_DB_URL" house-zen-<date>.dump

# 3. Validation obligatoire (un backup jamais restauré n'est pas validé — spec §21)
psql "$NEW_DB_URL" -c "select count(*) from tenants;"          # > 0
psql "$NEW_DB_URL" -c "select count(*) from reservations;"     # cohérent avec backup
psql "$NEW_DB_URL" -c "select count(*) from invoices where status='PAID';"
# Connexion applicative : owner → dashboard KPI non vides, réservation de test.

# 4. Bascule : pointer Vercel (VITE_SUPABASE_URL) sur le projet restauré + redeploy.
```

## Tests périodiques
- Trimestriel : restauration complète en staging + smoke tests + mesure RTO réel.
- Mensuel : PITR vers un timestamp aléatoire T-24 h, vérification d'intégrité.
- Chaque test documenté (date, durée, écarts) dans ce fichier (section journal).
