-- =========================
-- Migration 017: Extend tenant_role Enum
-- =========================
-- Description: Adds new role values to the existing tenant_role enum
-- =========================

BEGIN;

-- =========================
-- EXTEND ENUM WITH NEW ROLES
-- =========================
ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'tenant_admin';
ALTER TYPE tenant_role ADD VALUE IF NOT EXISTS 'legal_counsel';

COMMENT ON TYPE tenant_role IS 'User roles within a tenant: viewer, member, admin, tenant_admin, legal_counsel';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
-- Note: PostgreSQL does not support removing enum values, only adding
-- This migration is one-way for MVP
COMMIT;
*/