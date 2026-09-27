BEGIN;

-- =========================
-- Migration 020: Grant Privileges on Credit Packages Table to app_user
-- =========================
-- Description: Grant necessary permissions to app_user role for credit_packages.
-- Full CRUD: catalog sync on startup reads and writes Stripe IDs; the app
-- reads the table on checkout; no row-level deletion is expected.
-- =========================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_packages TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.credit_packages FROM app_user;

COMMIT;
*/
