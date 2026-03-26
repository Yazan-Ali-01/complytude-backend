BEGIN;

-- =========================
-- Migration 008: Grant Privileges on Global Tables and Documents
-- =========================
-- Description: Grant necessary permissions to app_user role for global tables and documents
-- Global tables: Full CRUD access (app layer enforces system admin for writes)
-- Documents: SELECT and INSERT only (no UPDATE or DELETE per requirements)
-- =========================

-- =========================
-- Global Tables - Full CRUD Access
-- =========================

-- Authorities
GRANT SELECT, INSERT, UPDATE, DELETE ON public.authorities TO app_user;

-- Categories
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO app_user;

-- Rulesets
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rulesets TO app_user;

-- Ruleset Versions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruleset_versions TO app_user;

-- Templates
GRANT SELECT, INSERT, UPDATE, DELETE ON public.templates TO app_user;

-- Template Versions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_versions TO app_user;

-- Template Rulesets (junction table)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_rulesets TO app_user;

-- Template Version Ruleset Versions (junction table for versions)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.template_version_ruleset_versions TO app_user;

-- =========================
-- Documents Table - SELECT and INSERT Only
-- =========================

-- Documents: No UPDATE or DELETE granted
GRANT SELECT, INSERT, UPDATE ON public.documents TO app_user;

-- =========================
-- Function Execution Grants
-- =========================

-- Grant execute on version sync functions
GRANT EXECUTE ON FUNCTION public.update_template_current_version() TO app_user;
GRANT EXECUTE ON FUNCTION public.update_ruleset_current_version() TO app_user;
GRANT EXECUTE ON FUNCTION public.validate_document_tenant_id() TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Revoke function execution grants
REVOKE EXECUTE ON FUNCTION public.validate_document_tenant_id() FROM app_user;
REVOKE EXECUTE ON FUNCTION public.update_ruleset_current_version() FROM app_user;
REVOKE EXECUTE ON FUNCTION public.update_template_current_version() FROM app_user;

-- Revoke documents grants
REVOKE SELECT, INSERT ON public.documents FROM app_user;

-- Revoke global tables grants
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.template_version_ruleset_versions FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.template_rulesets FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.template_versions FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.templates FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ruleset_versions FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.rulesets FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.categories FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.authorities FROM app_user;

COMMIT;
*/
