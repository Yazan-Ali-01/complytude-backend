BEGIN;

-- =========================
-- Migration 018: Grant Privileges on Stripe Tables to app_user
-- =========================
-- Description: Grant necessary permissions to app_user role for Stripe-related
-- tables. stripe_webhook_events gets full CRUD (events are inserted, updated
-- during processing, and can be queried/cleaned up by the app layer).
-- =========================

-- Stripe Webhook Events: Full CRUD
-- INSERT: write incoming events; UPDATE: update processing_status/attempts;
-- SELECT: query for retry/idempotency checks; DELETE: optional cleanup of old events
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stripe_webhook_events TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

REVOKE SELECT, INSERT, UPDATE, DELETE ON public.stripe_webhook_events FROM app_user;

COMMIT;
*/
