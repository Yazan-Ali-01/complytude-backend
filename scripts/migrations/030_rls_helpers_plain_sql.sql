BEGIN;

-- =========================
-- Migration 030: RLS helper functions as plain SQL
-- =========================
-- Description: the helpers every policy calls were plpgsql, and current_tenant_id_or_null() had
--              an EXCEPTION block (a subtransaction per call). Policies call them per row, so
--              RLS cost grew with rows scanned. As LANGUAGE sql STABLE functions without
--              exception handling the planner can inline them. Same results: an unset or
--              malformed app.tenant_id is NULL (the CASE checks the format instead of catching
--              the cast error), flags are true only when set to 'true'.
-- =========================

CREATE OR REPLACE FUNCTION public.current_tenant_id_or_null()
RETURNS UUID
LANGUAGE sql
STABLE
AS $$
    SELECT CASE
        WHEN current_setting('app.tenant_id', true)
             ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        THEN current_setting('app.tenant_id', true)::uuid
    END
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.is_tenant_admin', true), 'false') = 'true'
$$;

CREATE OR REPLACE FUNCTION public.is_auth_flow()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.is_auth_flow', true), 'false') = 'true'
$$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.platform_role', true), 'false') = 'true'
$$;

CREATE OR REPLACE FUNCTION public.allow_cross_tenant_read()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.allow_cross_tenant_read', true), 'false') = 'true'
$$;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
Restore the plpgsql definitions from 003_session_context_contract.sql with CREATE OR REPLACE.
*/
