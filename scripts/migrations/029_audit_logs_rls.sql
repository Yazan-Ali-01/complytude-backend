BEGIN;

-- =========================
-- Migration 029: Row-level security on audit_logs
-- =========================
-- Description: audit_logs holds per-tenant rows (actor, IP address, user agent, request details)
--              with no RLS: isolation depended on every query filtering by tenant_id. Now a
--              tenant context reads and writes only its own tenant's rows; rows with no tenant
--              (system and identity-level events) are written and read in platform-admin
--              context only. The table stays append-only (app_user has no UPDATE or DELETE).
-- =========================

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select
ON public.audit_logs
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

CREATE POLICY audit_logs_insert
ON public.audit_logs
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY audit_logs_select ON public.audit_logs IS
    'Tenant isolation for SELECT: a tenant sees its own audit rows; platform admins see all (including rows with no tenant)';
COMMENT ON POLICY audit_logs_insert ON public.audit_logs IS
    'Tenant isolation for INSERT: a tenant writes rows for itself only; rows with no tenant need platform-admin context';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
ALTER TABLE public.audit_logs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
COMMIT;
*/
