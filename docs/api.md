# HOUSE-ZEN — Conventions REST API v1

Base : `https://<project>.supabase.co` via Edge Functions préfixées `/api/v1/`
(spec PHASE 8). Auth : `Authorization: Bearer <jwt>` (session) **ou**
`X-API-Key: hz_<raw>` (machine, scopes). Chaque requête : `X-Request-Id`,
`Idempotency-Key` (écritures).

## Conventions
- Pagination : `?page=1&page_size=50` → `{ items, total, page, page_size }`
- Filtrage : `?status=CONFIRMED&property_id=…` (égalité, colonnes autorisées)
- Tri : `?sort=created_at&order=desc`
- Erreurs : `{ error: { code, message, request_id } }` — codes du domaine
  (`ROOM_UNAVAILABLE`, `INVALID_DATES`, `QUOTA_EXCEEDED`, `BALANCE_DUE`…)
- Rate limiting : par clé/JWT (Edge middleware), 429 + `Retry-After`
- CORS : origines configurées par environnement ; security headers identiques à Vercel
- Scopes API keys : `read` (toutes tables lecture), `write:reservations`,
  `write:payments`… (colonne `scopes`, migration 036)
- Idempotence : `api_idempotency(tenant_id, key)` — même clé → même réponse (200)
- Outbound webhooks : événements signés HMAC (retry exponentiel, dead-letter)

## Endpoints (v1)
```
GET    /api/v1/health
GET    /api/v1/properties
GET    /api/v1/rooms?status=OPERATIONAL
GET    /api/v1/availability?property_id&check_in&check_out&adults
POST   /api/v1/reservations            (Idempotency-Key requis) — passe par
                                       create_reservation_atomic
PATCH  /api/v1/reservations/:id/status { to, reason }
POST   /api/v1/reservations/:id/checkin
POST   /api/v1/reservations/:id/checkout { clear_balance }
GET    /api/v1/customers | POST | PATCH
GET    /api/v1/invoices | POST (from_reservation) | POST /:id/issue | POST /:id/void
POST   /api/v1/payments                (idempotent)
GET    /api/v1/reports/kpis
POST   /api/v1/webhooks/payment        (signature HMAC vérifiée, dédoublonné)
```

## OpenAPI 3.1 — extrait (spécification contractuelle)
```yaml
openapi: 3.1.0
info: { title: HOUSE-ZEN API, version: 1.0.0 }
paths:
  /api/v1/reservations:
    post:
      security: [{ bearerAuth: [] }, { apiKey: [] }]
      parameters:
        - { name: Idempotency-Key, in: header, required: true, schema: { type: string } }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [property_id, customer_id, room_id, check_in_date, check_out_date, adults]
              properties:
                property_id: { type: string, format: uuid }
                customer_id: { type: string, format: uuid }
                room_id:     { type: string, format: uuid }
                check_in_date:  { type: string, format: date }
                check_out_date: { type: string, format: date }
                adults:   { type: integer, minimum: 1 }
                children: { type: integer, minimum: 0 }
                notes:    { type: string }
      responses:
        '201': { description: Réservation confirmée (référence HZ-…) }
        '409': { description: ROOM_UNAVAILABLE / INVALID_DATES }
        '402': { description: QUOTA_EXCEEDED }
```
Le contrat complet sera généré depuis les schémas Zod partagés (prochaine itération).
