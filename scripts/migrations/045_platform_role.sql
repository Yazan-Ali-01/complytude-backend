BEGIN;

-- =========================
-- Migration 045: platform context needs the platform database role
-- =========================
-- Description: is_platform_admin() was true whenever app.platform_role was 'true', a setting any
--              session of the runtime role can set, so one injected set_config() lifted tenant
--              isolation on every table. The platform context now also requires membership of
--              app_platform, a role with no privileges of its own. Only the platform login (a
--              separate LOGIN role, member of app_user and app_platform, used by the API's
--              platform pool) has it; the login that serves tenant requests (app_login) does not,
--              and cannot SET ROLE to it.
--              Roles are created by scripts/setup-app-user-role.sql before the first migration;
--              app_platform is also created here so the function never names a missing role.
-- =========================

DO $$
BEGIN
    CREATE ROLE app_platform NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
    NULL;
END $$;

CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.platform_role', true), 'false') = 'true'
       AND pg_has_role(current_user, 'app_platform', 'MEMBER')
$$;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.platform_role', true), 'false') = 'true'
$$;
-- The role is cluster-wide and may be used by the platform login; drop it only once nothing does:
-- DROP ROLE app_platform;
COMMIT;
*/
