BEGIN;

-- =========================
-- Migration 043: row-level security on tenant_roles
-- =========================
-- Description: tenant_roles holds the system roles (tenant_id NULL, synced from code at startup) and
--              tenants' custom roles (tenant_id set). It had no RLS, so a custom role was visible to
--              every tenant. Now:
--              - system roles are readable in any context (every tenant uses them);
--              - a custom role is readable in its tenant's context, in the auth flow (login lists
--                every membership with its role) and in platform context;
--              - a custom role is written only in its tenant's context, a system role only in
--                platform context (the startup sync).
--              The app role has no DELETE on this table (migration 038).
-- =========================

ALTER TABLE public.tenant_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_roles_select
ON public.tenant_roles
FOR SELECT
USING (
    tenant_id IS NULL
    OR tenant_id = current_tenant_id_or_null()
    OR is_auth_flow()
    OR is_platform_admin()
);

CREATE POLICY tenant_roles_insert
ON public.tenant_roles
FOR INSERT
WITH CHECK (
    (tenant_id IS NOT NULL AND tenant_id = current_tenant_id_or_null())
    OR is_platform_admin()
);

CREATE POLICY tenant_roles_update
ON public.tenant_roles
FOR UPDATE
USING (
    (tenant_id IS NOT NULL AND tenant_id = current_tenant_id_or_null())
    OR is_platform_admin()
)
WITH CHECK (
    (tenant_id IS NOT NULL AND tenant_id = current_tenant_id_or_null())
    OR is_platform_admin()
);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP POLICY IF EXISTS tenant_roles_update ON public.tenant_roles;
DROP POLICY IF EXISTS tenant_roles_insert ON public.tenant_roles;
DROP POLICY IF EXISTS tenant_roles_select ON public.tenant_roles;
ALTER TABLE public.tenant_roles NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_roles DISABLE ROW LEVEL SECURITY;
COMMIT;
*/
