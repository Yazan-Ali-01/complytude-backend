BEGIN;

-- =========================
-- Migration 049: audit log retention
-- =========================
-- Description: decision D-7: audit rows are kept 2 years, and their IP address and user agent are
--              blanked after 90 days, by the daily retention sweep. The login that serves tenant
--              requests stays append-only (app_user: SELECT, INSERT). Only app_platform (the
--              platform login's role, migration 045) may change or delete audit rows, and only as
--              retention does: in platform context, blank both client columns on a row older than
--              90 days, or delete a row older than 2 years. The windows are fixed here so a bug in
--              the sweep can't touch a younger row.
-- =========================

GRANT UPDATE (ip_address, user_agent) ON public.audit_logs TO app_platform;
GRANT DELETE ON public.audit_logs TO app_platform;

CREATE POLICY audit_logs_blank_client
ON public.audit_logs
FOR UPDATE
TO app_platform
USING (is_platform_admin() AND created_at < now() - interval '90 days')
WITH CHECK (ip_address IS NULL AND user_agent IS NULL);

CREATE POLICY audit_logs_expire
ON public.audit_logs
FOR DELETE
TO app_platform
USING (is_platform_admin() AND created_at < now() - interval '2 years');

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP POLICY IF EXISTS audit_logs_expire ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_blank_client ON public.audit_logs;
REVOKE DELETE ON public.audit_logs FROM app_platform;
REVOKE UPDATE (ip_address, user_agent) ON public.audit_logs FROM app_platform;
COMMIT;
*/
