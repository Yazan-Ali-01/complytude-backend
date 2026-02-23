BEGIN;

-- =========================
-- Migration 016: RLS Policies for Vector Tables
-- =========================
-- Description: Row-level security policies for tenant-scoped analysis_jobs table
-- Follows documents pattern: tenant isolation with platform admin override
-- Worker-ai will use bypassRLS for status transitions when processing jobs
-- =========================

-- =========================
-- analysis_jobs
-- =========================
-- Note: DELETE is intentionally not supported. No DELETE grant (014) and no DELETE policy.
-- With RLS enabled, absence of a permissive policy denies the operation. analysis_jobs are
-- historical records; use soft-delete patterns in the app layer if retention is needed.

-- SELECT: Users see their tenant's analysis jobs; platform admins see all
CREATE POLICY analysis_jobs_select
ON public.analysis_jobs
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY analysis_jobs_select ON public.analysis_jobs IS
    'Tenant isolation for SELECT - users can only see their tenant''s analysis jobs; platform admins see all';

-- INSERT: Users create jobs for their tenant; platform admins for any tenant
CREATE POLICY analysis_jobs_insert
ON public.analysis_jobs
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY analysis_jobs_insert ON public.analysis_jobs IS
    'Tenant isolation for INSERT - users can only create jobs for their own tenant; platform admins for any';

-- UPDATE: Users update their tenant's jobs; platform admins for any tenant (worker-ai uses bypassRLS)
CREATE POLICY analysis_jobs_update
ON public.analysis_jobs
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY analysis_jobs_update ON public.analysis_jobs IS
    'Tenant isolation for UPDATE - users can update their tenant''s jobs; platform admins for any; worker-ai bypasses RLS';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop policies
DROP POLICY IF EXISTS analysis_jobs_update ON public.analysis_jobs;
DROP POLICY IF EXISTS analysis_jobs_insert ON public.analysis_jobs;
DROP POLICY IF EXISTS analysis_jobs_select ON public.analysis_jobs;

COMMIT;
*/
