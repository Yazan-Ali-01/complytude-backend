BEGIN;

-- =========================
-- Migration 035: count usage per billing period
-- =========================
-- Description: aggregated_usage kept one row per subscription and feature, so a monthly quota
--              counted the subscription's whole lifetime (BILL-003). The billing period is now
--              the key: the instant the period started (UTC, to the millisecond, e.g.
--              2026-10-15T09:30:00.000Z), so a Stripe renewal, a trial ending, a paid checkout or a
--              free-plan renewal each start from zero, even within the same month. Rows written
--              before this migration carry a YYYY-MM period and are simply not the current
--              period's any more (pre-production data).
-- =========================

ALTER TABLE public.usage_ledger ALTER COLUMN billing_period TYPE VARCHAR(32);
ALTER TABLE public.aggregated_usage ALTER COLUMN billing_period TYPE VARCHAR(32);

ALTER TABLE public.aggregated_usage
    DROP CONSTRAINT uq_aggregated_usage_subscription_feature;
ALTER TABLE public.aggregated_usage
    ADD CONSTRAINT uq_aggregated_usage_subscription_feature_period
    UNIQUE (subscription_id, feature_id, billing_period);

COMMENT ON TABLE public.aggregated_usage IS
    'Aggregated usage projection (rebuilt from usage_ledger) - one row per subscription, feature and billing period';
COMMENT ON COLUMN public.aggregated_usage.billing_period IS
    'Billing period key: the period start in UTC to the millisecond (YYYY-MM-DDTHH:MM:SS.mmmZ); part of the unique key';
COMMENT ON COLUMN public.usage_ledger.billing_period IS
    'Billing period key: the period start in UTC to the millisecond (YYYY-MM-DDTHH:MM:SS.mmmZ)';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.aggregated_usage DROP CONSTRAINT uq_aggregated_usage_subscription_feature_period;
DELETE FROM public.aggregated_usage a USING public.aggregated_usage b
 WHERE a.subscription_id = b.subscription_id AND a.feature_id = b.feature_id
   AND a.last_updated_at < b.last_updated_at;
ALTER TABLE public.aggregated_usage
    ADD CONSTRAINT uq_aggregated_usage_subscription_feature UNIQUE (subscription_id, feature_id);
UPDATE public.aggregated_usage SET billing_period = left(billing_period, 7);
ALTER TABLE public.aggregated_usage ALTER COLUMN billing_period TYPE VARCHAR(7);
-- usage_ledger rows are immutable (trigger): widen-only, leave the column at VARCHAR(32)
COMMIT;
*/
