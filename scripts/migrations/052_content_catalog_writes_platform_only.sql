BEGIN;

-- =========================
-- Migration 052: content catalogs written only by the platform login
-- =========================
-- Description: templates, template versions and their ruleset links, rulesets, ruleset versions,
--              authorities and categories are written by the platform-admin endpoints and the
--              ruleset load CLI, which now run in platform context as the platform login
--              (member of app_platform, migration 045). The login that serves tenant requests
--              (app_user) keeps SELECT, plus what the ingestion worker (no platform login) needs:
--              ruleset_chunks (unchanged) and the ingestion columns of ruleset_versions. The
--              triggers that keep templates/rulesets.current_version in step are SECURITY DEFINER
--              and unaffected.
-- =========================

REVOKE INSERT, UPDATE, DELETE ON public.templates FROM app_user;
REVOKE INSERT, UPDATE ON public.template_versions FROM app_user;
REVOKE INSERT, DELETE ON public.template_rulesets FROM app_user;
REVOKE INSERT, UPDATE ON public.rulesets FROM app_user;
REVOKE INSERT, UPDATE ON public.ruleset_versions FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON public.authorities FROM app_user;
REVOKE INSERT, UPDATE ON public.categories FROM app_user;

-- worker-ingestion records each version's ingestion
GRANT UPDATE (ingestion_status, chunk_count, ingested_at, ingestion_error)
    ON public.ruleset_versions TO app_user;

GRANT INSERT, UPDATE, DELETE ON public.templates TO app_platform;
GRANT INSERT, UPDATE ON public.template_versions TO app_platform;
GRANT INSERT, DELETE ON public.template_rulesets TO app_platform;
GRANT INSERT, UPDATE ON public.rulesets TO app_platform;
GRANT INSERT, UPDATE ON public.ruleset_versions TO app_platform;
GRANT INSERT, UPDATE, DELETE ON public.authorities TO app_platform;
GRANT INSERT, UPDATE ON public.categories TO app_platform;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
REVOKE INSERT, UPDATE, DELETE ON public.templates FROM app_platform;
REVOKE INSERT, UPDATE ON public.template_versions FROM app_platform;
REVOKE INSERT, DELETE ON public.template_rulesets FROM app_platform;
REVOKE INSERT, UPDATE ON public.rulesets FROM app_platform;
REVOKE INSERT, UPDATE ON public.ruleset_versions FROM app_platform;
REVOKE INSERT, UPDATE, DELETE ON public.authorities FROM app_platform;
REVOKE INSERT, UPDATE ON public.categories FROM app_platform;
REVOKE UPDATE (ingestion_status, chunk_count, ingested_at, ingestion_error) ON public.ruleset_versions FROM app_user;
GRANT INSERT, UPDATE, DELETE ON public.templates TO app_user;
GRANT INSERT, UPDATE ON public.template_versions TO app_user;
GRANT INSERT, DELETE ON public.template_rulesets TO app_user;
GRANT INSERT, UPDATE ON public.rulesets TO app_user;
GRANT INSERT, UPDATE ON public.ruleset_versions TO app_user;
GRANT INSERT, UPDATE, DELETE ON public.authorities TO app_user;
GRANT INSERT, UPDATE ON public.categories TO app_user;
COMMIT;
*/
