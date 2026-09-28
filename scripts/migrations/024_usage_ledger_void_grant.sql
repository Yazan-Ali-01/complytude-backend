BEGIN;

-- =========================
-- Migration 024: Let the app void usage ledger rows
-- =========================
-- Description: Usage refunds set usage_ledger.voided_at (the immutability trigger
--              allows it once, NULL → timestamp), but app_user was only granted
--              UPDATE (projected_at), so every refund failed with permission denied.
-- =========================

GRANT UPDATE (voided_at) ON public.usage_ledger TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

REVOKE UPDATE (voided_at) ON public.usage_ledger FROM app_user;

COMMIT;
*/
