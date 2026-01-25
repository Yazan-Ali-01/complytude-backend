-- =========================
-- Migration 022: Migrate admin to tenant_admin
-- =========================
-- Description: Updates existing admin role users to tenant_admin
-- =========================

BEGIN;

-- =========================
-- MIGRATE EXISTING ADMINS
-- =========================
UPDATE public.user_tenants
SET role = 'tenant_admin'
WHERE role = 'admin';

COMMENT ON COLUMN public.user_tenants.role IS 'User role within tenant: viewer, member, admin (deprecated - use tenant_admin), tenant_admin, legal_counsel';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
-- Note: This is a one-way migration for MVP
-- Reverting would require knowing which users were admins before
COMMIT;
*/