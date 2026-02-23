BEGIN;

-- =========================
-- Migration 014: Grant Privileges on Vector Tables to app_user
-- =========================
-- Description: Grant necessary permissions to app_user role for vector storage and analysis tables
-- ruleset_chunks: Full CRUD (global table, app layer enforces system admin for writes)
-- analysis_jobs: SELECT, INSERT, UPDATE (no DELETE - jobs are historical records)
-- =========================

-- =========================
-- ruleset_chunks - Full CRUD Access (Global Table)
-- =========================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruleset_chunks TO app_user;

-- =========================
-- analysis_jobs - SELECT, INSERT, UPDATE (No DELETE)
-- =========================
-- DELETE intentionally not granted: analysis_jobs are historical records. Attempts to DELETE
-- will fail with "permission denied for table analysis_jobs" at the privilege layer.

GRANT SELECT, INSERT, UPDATE ON public.analysis_jobs TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Revoke analysis_jobs grants
REVOKE SELECT, INSERT, UPDATE ON public.analysis_jobs FROM app_user;

-- Revoke ruleset_chunks grants
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.ruleset_chunks FROM app_user;

COMMIT;
*/
