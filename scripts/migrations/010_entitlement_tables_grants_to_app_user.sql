BEGIN;

-- =========================
-- Migration 010: Grant Privileges on Entitlement Tables to app_user
-- =========================
-- Description: Grant necessary permissions to app_user role for entitlement system tables
-- Catalog tables: Full CRUD (admin manages via app layer)
-- Tenant-scoped tables: SELECT, INSERT, UPDATE (no DELETE)
-- Ledgers: SELECT, INSERT only (immutable)
-- Projections: Full CRUD (rebuilt from ledgers)
-- Domain events: SELECT, INSERT only (immutable)
-- =========================

-- =========================
-- Catalog Tables - Full CRUD Access
-- =========================

-- Features
GRANT SELECT, INSERT, UPDATE, DELETE ON public.features TO app_user;

-- Plans
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO app_user;

-- Plan Entitlements
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_entitlements TO app_user;

-- Add-ons
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addons TO app_user;

-- Add-on Entitlements
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addon_entitlements TO app_user;

-- =========================
-- Tenant-Scoped Tables - SELECT, INSERT, UPDATE (No DELETE)
-- =========================

-- Tenant Subscriptions
GRANT SELECT, INSERT, UPDATE ON public.tenant_subscriptions TO app_user;

-- Tenant Add-ons
GRANT SELECT, INSERT, UPDATE ON public.tenant_addons TO app_user;

-- Tenant Overrides
GRANT SELECT, INSERT, UPDATE ON public.tenant_overrides TO app_user;

-- =========================
-- Event Ledgers - SELECT and INSERT Only (Immutable)
-- =========================

-- Usage Ledger
GRANT SELECT, INSERT ON public.usage_ledger TO app_user;

-- Credit Ledger
GRANT SELECT, INSERT ON public.credit_ledger TO app_user;

-- =========================
-- Projections - Full CRUD (Rebuilt from Ledgers)
-- =========================

-- Aggregated Usage
GRANT SELECT, INSERT, UPDATE, DELETE ON public.aggregated_usage TO app_user;

-- Entitlement Snapshots
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entitlement_snapshots TO app_user;

-- =========================
-- Domain Events - SELECT and INSERT Only (Immutable)
-- =========================

-- Domain Events
GRANT SELECT, INSERT ON public.domain_events TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Revoke domain events grants
REVOKE SELECT, INSERT ON public.domain_events FROM app_user;

-- Revoke projections grants
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.entitlement_snapshots FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.aggregated_usage FROM app_user;

-- Revoke ledger grants
REVOKE SELECT, INSERT ON public.credit_ledger FROM app_user;
REVOKE SELECT, INSERT ON public.usage_ledger FROM app_user;

-- Revoke tenant-scoped table grants
REVOKE SELECT, INSERT, UPDATE ON public.tenant_overrides FROM app_user;
REVOKE SELECT, INSERT, UPDATE ON public.tenant_addons FROM app_user;
REVOKE SELECT, INSERT, UPDATE ON public.tenant_subscriptions FROM app_user;

-- Revoke catalog table grants
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.addon_entitlements FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.addons FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.plan_entitlements FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.plans FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.features FROM app_user;

COMMIT;
*/
