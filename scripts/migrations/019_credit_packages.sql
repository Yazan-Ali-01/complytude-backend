BEGIN;

-- =========================
-- Migration 019: Credit Packages Table
-- =========================
-- Description: Global table storing credit bundle definitions and their
-- corresponding Stripe Product/Price IDs (populated by StripeCatalogSyncService).
-- No RLS — credit packages are a global catalog, not tenant-scoped.
-- =========================

CREATE TABLE public.credit_packages (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                 VARCHAR(100) NOT NULL UNIQUE,
    name                VARCHAR(255) NOT NULL,
    credits             INTEGER NOT NULL,
    price_aed           NUMERIC(10, 2) NOT NULL,
    stripe_product_id   VARCHAR(255),
    stripe_price_id     VARCHAR(255),
    is_active           BOOLEAN NOT NULL DEFAULT true,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_packages IS 'One-time credit bundle definitions and their Stripe Product/Price IDs';
COMMENT ON COLUMN public.credit_packages.key IS 'Unique code-side key (e.g. credits_50) — matches CREDIT_PACKAGES constant';
COMMENT ON COLUMN public.credit_packages.credits IS 'Number of credits the buyer receives';
COMMENT ON COLUMN public.credit_packages.price_aed IS 'One-time price in AED';
COMMENT ON COLUMN public.credit_packages.stripe_product_id IS 'Stripe Product ID — populated by StripeCatalogSyncService';
COMMENT ON COLUMN public.credit_packages.stripe_price_id IS 'Stripe Price ID (one_time) — populated by StripeCatalogSyncService';

CREATE INDEX idx_credit_packages_key ON public.credit_packages(key);
CREATE INDEX idx_credit_packages_stripe_price ON public.credit_packages(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

DROP INDEX IF EXISTS public.idx_credit_packages_stripe_price;
DROP INDEX IF EXISTS public.idx_credit_packages_key;
DROP TABLE IF EXISTS public.credit_packages;

COMMIT;
*/
