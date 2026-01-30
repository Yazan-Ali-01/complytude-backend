BEGIN;

-- =========================
-- Migration 004: Enable Row Level Security
-- =========================
-- Description: Enable RLS on tenant-related tables to enforce tenant isolation
-- Note: FORCE ROW LEVEL SECURITY ensures RLS applies even to table owners
-- 
-- RLS Strategy:
-- - tenants: Enforce tenant isolation
-- - user_tenants: Enforce tenant membership visibility and role-based access
-- - users: No RLS (managed by application layer for performance)
-- - auth tables: No RLS (internal app-managed tables)
-- 
-- IMPORTANT: Migration accounts must have bypass_rls privilege to run future migrations
-- Grant bypass_rls to migration role:
--   ALTER ROLE migration_user WITH BYPASSRLS;
-- =========================

-- =========================
-- Enable RLS on Tenant Tables
-- =========================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants FORCE ROW LEVEL SECURITY;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Disable RLS on tenant tables
ALTER TABLE public.user_tenants DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants DISABLE ROW LEVEL SECURITY;

COMMIT;
*/
