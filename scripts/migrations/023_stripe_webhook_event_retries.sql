BEGIN;

-- =========================
-- Migration 023: Stripe webhook event delivery and retry tracking
-- =========================
-- Description: Separates Stripe deliveries from processing attempts and records
--              when a failed event is next due, so failed events are re-driven
--              automatically with backoff instead of being stranded.
-- =========================

ALTER TABLE public.stripe_webhook_events
    ADD COLUMN deliveries            INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN processing_started_at TIMESTAMPTZ,
    ADD COLUMN next_retry_at         TIMESTAMPTZ;

COMMENT ON COLUMN public.stripe_webhook_events.attempts IS 'Number of processing attempts (each atomic claim). Stripe deliveries are counted in deliveries';
COMMENT ON COLUMN public.stripe_webhook_events.deliveries IS 'Number of times Stripe delivered this event to the webhook endpoint';
COMMENT ON COLUMN public.stripe_webhook_events.processing_started_at IS 'When the latest processing attempt claimed the event; a stale processing claim is re-driven';
COMMENT ON COLUMN public.stripe_webhook_events.next_retry_at IS 'When a failed event is next re-driven automatically; NULL once completed or out of attempts';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

ALTER TABLE public.stripe_webhook_events
    DROP COLUMN IF EXISTS next_retry_at,
    DROP COLUMN IF EXISTS processing_started_at,
    DROP COLUMN IF EXISTS deliveries;

COMMIT;
*/
