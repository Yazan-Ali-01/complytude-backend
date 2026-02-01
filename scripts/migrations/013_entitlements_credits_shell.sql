-- SHELL: Requires billing integration (Stripe) to be functional

BEGIN;

-- =========================
-- Migration 013: Credit Packages & Top-up Model (Shell)
-- =========================
-- Description: Creates credit system tables for add-on purchases (contract reviews, document generation, surcharges)
-- =========================

-- =========================
-- CREDIT PACKAGES TABLE (Available Packages)
-- =========================
CREATE TABLE public.credit_packages (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    feature_key     VARCHAR(100) NOT NULL,
    credits         INTEGER NOT NULL,
    price_aed       DECIMAL(10, 2) NOT NULL,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_package_feature
        FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE RESTRICT,
    CONSTRAINT chk_credits_positive
        CHECK (credits > 0),
    CONSTRAINT chk_price_positive
        CHECK (price_aed > 0)
);

COMMENT ON TABLE public.credit_packages IS 'Available credit packages for top-up purchases';
COMMENT ON COLUMN public.credit_packages.feature_key IS 'The feature this credit applies to (e.g., contract_reviews_per_month)';
COMMENT ON COLUMN public.credit_packages.credits IS 'Number of credits included in this package';
COMMENT ON COLUMN public.credit_packages.price_aed IS 'Price in AED for this package';

-- =========================
-- TENANT CREDITS TABLE (Purchased Credits Balance)
-- =========================
CREATE TABLE public.tenant_credits (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    feature_key         VARCHAR(100) NOT NULL,
    credits_remaining   INTEGER NOT NULL DEFAULT 0,
    expires_at          TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_credits_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_credits_feature
        FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE RESTRICT,
    CONSTRAINT uq_tenant_feature_credits
        UNIQUE (tenant_id, feature_key),
    CONSTRAINT chk_credits_non_negative
        CHECK (credits_remaining >= 0)
);

COMMENT ON TABLE public.tenant_credits IS 'Tenant purchased credit balances per feature';
COMMENT ON COLUMN public.tenant_credits.credits_remaining IS 'Number of credits remaining for this feature';
COMMENT ON COLUMN public.tenant_credits.expires_at IS 'Optional expiration date for purchased credits';

-- =========================
-- CREDIT TRANSACTIONS TABLE (Purchase History)
-- =========================
CREATE TYPE credit_transaction_status AS ENUM ('pending', 'completed', 'failed', 'refunded');

CREATE TABLE public.credit_transactions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    package_id          UUID NOT NULL,
    credits             INTEGER NOT NULL,
    price_aed           DECIMAL(10, 2) NOT NULL,
    payment_reference   VARCHAR(255),
    status              credit_transaction_status NOT NULL DEFAULT 'pending',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_transaction_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_transaction_package
        FOREIGN KEY (package_id) REFERENCES public.credit_packages(id) ON DELETE RESTRICT,
    CONSTRAINT chk_transaction_credits_positive
        CHECK (credits > 0),
    CONSTRAINT chk_transaction_price_positive
        CHECK (price_aed > 0)
);

COMMENT ON TABLE public.credit_transactions IS 'Credit purchase transaction history';
COMMENT ON COLUMN public.credit_transactions.payment_reference IS 'External payment reference (e.g., Stripe payment intent ID)';
COMMENT ON COLUMN public.credit_transactions.status IS 'Transaction status: pending, completed, failed, refunded';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_credit_packages_feature ON public.credit_packages(feature_key) WHERE is_active = true;
CREATE INDEX idx_tenant_credits_tenant ON public.tenant_credits(tenant_id);
CREATE INDEX idx_tenant_credits_expires ON public.tenant_credits(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_credit_transactions_tenant ON public.credit_transactions(tenant_id, created_at DESC);
CREATE INDEX idx_credit_transactions_status ON public.credit_transactions(status) WHERE status = 'pending';

-- =========================
-- TRIGGERS
-- =========================
CREATE TRIGGER update_tenant_credits_updated_at
    BEFORE UPDATE ON public.tenant_credits
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- SEED DATA: Credit Packages
-- =========================
INSERT INTO public.credit_packages (name, feature_key, credits, price_aed, is_active)
VALUES
    ('Extra Contract Review', 'contract_reviews_per_month', 1, 99.00, true),
    ('Extra Document Generation', 'documents_per_month', 1, 125.00, true),
    ('Document Length Surcharge (15+ pages)', 'documents_per_month', 2, 125.00, true),
    ('Document Length Surcharge (40+ pages)', 'documents_per_month', 3, 125.00, true);

-- =========================
-- GRANTS
-- =========================
-- Note: DELETE is not granted on credit_packages, tenant_credits, or credit_transactions
GRANT SELECT, INSERT, UPDATE ON public.credit_packages TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.tenant_credits TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.credit_transactions TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP TRIGGER IF EXISTS update_tenant_credits_updated_at ON public.tenant_credits;
DROP INDEX IF EXISTS idx_credit_transactions_status;
DROP INDEX IF EXISTS idx_credit_transactions_tenant;
DROP INDEX IF EXISTS idx_tenant_credits_expires;
DROP INDEX IF EXISTS idx_tenant_credits_tenant;
DROP INDEX IF EXISTS idx_credit_packages_feature;
DROP TABLE IF EXISTS public.credit_transactions;
DROP TABLE IF EXISTS public.tenant_credits;
DROP TABLE IF EXISTS public.credit_packages;
DROP TYPE IF EXISTS credit_transaction_status;
COMMIT;
*/
