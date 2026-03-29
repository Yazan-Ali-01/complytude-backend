BEGIN;

-- =========================
-- Migration 022: Grant Privileges on Generation Jobs Table
-- =========================
-- Description: Grant necessary permissions to app_user for generation_jobs.
--              Full CRUD — API deducts entitlement + creates job row,
--              worker updates status/result, platform admin context for worker.
-- =========================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generation_jobs TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.generation_jobs FROM app_user;

COMMIT;
*/
