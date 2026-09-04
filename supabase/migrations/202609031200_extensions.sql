-- ============================================================
-- HOUSE-ZEN — 000 Extensions bootstrap
-- Active les extensions requises par l'ensemble des migrations.
-- Supabase : search_path du rôle postgres = "$user", public, extensions
-- (les types/fonctions citext & pgcrypto restent appelables non qualifiés).
-- Idempotent : sûr sur tout environnement neuf ou déjà provisionné.
-- ============================================================

-- Types texte insensibles à la casse (emails: tenants, customers, suppliers, billing)
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA extensions;

-- Fonctions cryptographiques (hash API keys, chiffrement PII hzenc.v1)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
