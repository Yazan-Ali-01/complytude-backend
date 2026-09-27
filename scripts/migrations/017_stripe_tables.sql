BEGIN;

-- =========================
-- Migration 017: Stripe Webhook Events Table
-- =========================
-- Description: Creates the stripe_webhook_events table for idempotent webhook
-- processing. This table is NOT tenant-scoped (no RLS) as webhook events are
-- global and may reference any tenant.
-- =========================

CREATE TABLE public.stripe_webhook_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stripe_event_id     VARCHAR(255) NOT NULL UNIQUE,
    event_type          VARCHAR(100) NOT NULL,
    stripe_api_version  VARCHAR(50),
    data                JSONB NOT NULL,
    processing_status   VARCHAR(20) NOT NULL DEFAULT 'pending',
    processing_error    TEXT,
    attempts            INTEGER NOT NULL DEFAULT 0,
    processed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_stripe_webhook_events_status CHECK (
        processing_status IN ('pending', 'processing', 'completed', 'failed')
    )
);

COMMENT ON TABLE public.stripe_webhook_events IS 'Stripe webhook event log — serves as both idempotency guard and audit trail';
COMMENT ON COLUMN public.stripe_webhook_events.stripe_event_id IS 'Stripe event ID (evt_xxx) — UNIQUE enforces idempotency';
COMMENT ON COLUMN public.stripe_webhook_events.event_type IS 'Stripe event type (e.g. checkout.session.completed)';
COMMENT ON COLUMN public.stripe_webhook_events.stripe_api_version IS 'Stripe API version from the event payload';
COMMENT ON COLUMN public.stripe_webhook_events.data IS 'Full Stripe event payload as JSONB';
COMMENT ON COLUMN public.stripe_webhook_events.processing_status IS 'Lifecycle status: pending → processing → completed | failed';
COMMENT ON COLUMN public.stripe_webhook_events.processing_error IS 'Error message if processing_status = failed';
COMMENT ON COLUMN public.stripe_webhook_events.attempts IS 'Number of processing attempts (for retry tracking)';
COMMENT ON COLUMN public.stripe_webhook_events.processed_at IS 'Timestamp when processing completed (NULL until completed or failed)';

CREATE INDEX idx_stripe_webhook_events_status ON public.stripe_webhook_events(processing_status);
CREATE INDEX idx_stripe_webhook_events_type ON public.stripe_webhook_events(event_type);
CREATE INDEX idx_stripe_webhook_events_created ON public.stripe_webhook_events(created_at);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

DROP INDEX IF EXISTS public.idx_stripe_webhook_events_created;
DROP INDEX IF EXISTS public.idx_stripe_webhook_events_type;
DROP INDEX IF EXISTS public.idx_stripe_webhook_events_status;
DROP TABLE IF EXISTS public.stripe_webhook_events;

COMMIT;
*/
