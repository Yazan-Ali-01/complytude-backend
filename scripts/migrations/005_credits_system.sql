-- ============================================================================
-- Migration 005: Credits System (Stripe-ready)
-- ============================================================================
-- Description: Add-on credits for when quota is exhausted. Stripe-ready payment integration support.
-- Dependencies: Migration 001 (multi-tenancy)
-- ============================================================================

-- ============================================================================
-- 1. CREDITS TABLES
-- ============================================================================

-- Tenant Credits Table (balance per feature)
CREATE TABLE IF NOT EXISTS public.tenant_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(tenant_id, feature_key)
);

COMMENT ON TABLE public.tenant_credits IS 'Purchased add-on credits balance per feature (Stripe-ready)';
COMMENT ON COLUMN public.tenant_credits.feature_key IS 'Feature key that these credits apply to (e.g., documents_per_month)';

-- Credit Purchases Table (audit trail for payments)
CREATE TABLE IF NOT EXISTS public.credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL,
    credits_purchased INTEGER NOT NULL,
    price_aed DECIMAL(10,2) NOT NULL,

    -- Stripe integration (NULL until connected)
    stripe_payment_intent_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),

    -- Audit trail
    purchased_by VARCHAR(255) REFERENCES public.users(id),
    purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.credit_purchases IS 'Credit purchase history with Stripe payment tracking';

-- Credit Usage Log (when credits are consumed)
CREATE TABLE IF NOT EXISTS public.credit_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    feature_key VARCHAR(100) NOT NULL,
    credits_used INTEGER NOT NULL,
    credits_before INTEGER NOT NULL,
    credits_after INTEGER NOT NULL,
    user_id VARCHAR(255),
    reason TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.credit_usage_log IS 'Audit log of credit consumption';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_credits_tenant ON public.tenant_credits(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credits_feature ON public.tenant_credits(feature_key);
CREATE INDEX IF NOT EXISTS idx_credits_tenant_feature ON public.tenant_credits(tenant_id, feature_key);

CREATE INDEX IF NOT EXISTS idx_purchases_tenant ON public.credit_purchases(tenant_id);
CREATE INDEX IF NOT EXISTS idx_purchases_status ON public.credit_purchases(payment_status);
CREATE INDEX IF NOT EXISTS idx_purchases_feature ON public.credit_purchases(feature_key);
CREATE INDEX IF NOT EXISTS idx_purchases_stripe ON public.credit_purchases(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_credit_usage_tenant ON public.credit_usage_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credit_usage_feature ON public.credit_usage_log(feature_key);
CREATE INDEX IF NOT EXISTS idx_credit_usage_created ON public.credit_usage_log(created_at);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE public.tenant_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usage_log ENABLE ROW LEVEL SECURITY;

-- Credits RLS - tenants can see their own credits
DROP POLICY IF EXISTS credits_tenant_read ON public.tenant_credits;
CREATE POLICY credits_tenant_read ON public.tenant_credits FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

DROP POLICY IF EXISTS credits_admin_write ON public.tenant_credits;
CREATE POLICY credits_admin_write ON public.tenant_credits FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- Purchases RLS - tenants can see their own purchases
DROP POLICY IF EXISTS purchases_tenant_read ON public.credit_purchases;
CREATE POLICY purchases_tenant_read ON public.credit_purchases FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

DROP POLICY IF EXISTS purchases_admin_write ON public.credit_purchases;
CREATE POLICY purchases_admin_write ON public.credit_purchases FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- Credit Usage RLS - tenants can see their own usage
DROP POLICY IF EXISTS credit_usage_read ON public.credit_usage_log;
CREATE POLICY credit_usage_read ON public.credit_usage_log FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

DROP POLICY IF EXISTS credit_usage_write ON public.credit_usage_log;
CREATE POLICY credit_usage_write ON public.credit_usage_log FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Get credits balance for a tenant/feature
CREATE OR REPLACE FUNCTION public.get_credits_balance(p_tenant_id VARCHAR, p_feature_key VARCHAR)
RETURNS INTEGER AS $$
DECLARE
    v_credits INTEGER;
BEGIN
    SELECT credits_remaining INTO v_credits
    FROM public.tenant_credits
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;

    RETURN COALESCE(v_credits, 0);
END;
$$ LANGUAGE plpgsql;

-- Deduct credits atomically
CREATE OR REPLACE FUNCTION public.deduct_credits(
    p_tenant_id VARCHAR,
    p_feature_key VARCHAR,
    p_amount INTEGER,
    p_user_id VARCHAR DEFAULT NULL,
    p_reason TEXT DEFAULT NULL
) RETURNS TABLE (
    success BOOLEAN,
    credits_before INTEGER,
    credits_after INTEGER
) AS $$
DECLARE
    v_current INTEGER;
    v_new INTEGER;
BEGIN
    -- Get current balance with lock
    SELECT credits_remaining INTO v_current
    FROM public.tenant_credits
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key
    FOR UPDATE;

    IF v_current IS NULL OR v_current < p_amount THEN
        RETURN QUERY SELECT false, COALESCE(v_current, 0), COALESCE(v_current, 0);
        RETURN;
    END IF;

    v_new := v_current - p_amount;

    -- Deduct
    UPDATE public.tenant_credits
    SET credits_remaining = v_new, updated_at = CURRENT_TIMESTAMP
    WHERE tenant_id = p_tenant_id AND feature_key = p_feature_key;

    -- Log
    INSERT INTO public.credit_usage_log (tenant_id, feature_key, credits_used, credits_before, credits_after, user_id, reason)
    VALUES (p_tenant_id, p_feature_key, p_amount, v_current, v_new, p_user_id, p_reason);

    RETURN QUERY SELECT true, v_current, v_new;
END;
$$ LANGUAGE plpgsql;

-- Add credits (called by Stripe webhook or admin)
CREATE OR REPLACE FUNCTION public.add_credits(
    p_tenant_id VARCHAR,
    p_feature_key VARCHAR,
    p_amount INTEGER
) RETURNS INTEGER AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    INSERT INTO public.tenant_credits (tenant_id, feature_key, credits_remaining)
    VALUES (p_tenant_id, p_feature_key, p_amount)
    ON CONFLICT (tenant_id, feature_key)
    DO UPDATE SET credits_remaining = tenant_credits.credits_remaining + p_amount, updated_at = CURRENT_TIMESTAMP
    RETURNING credits_remaining INTO v_new_balance;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- Check usage with credits fallback (requires tenant_usage table from migration 004 if it exists)
CREATE OR REPLACE FUNCTION public.check_usage_with_credits(
    p_tenant_id VARCHAR,
    p_feature_key VARCHAR,
    p_quota_limit INTEGER DEFAULT -1,
    p_current_usage INTEGER DEFAULT 0
) RETURNS TABLE (
    allowed BOOLEAN,
    source VARCHAR(20),
    current_usage INTEGER,
    usage_limit INTEGER,
    remaining_quota INTEGER,
    credits_available INTEGER
) AS $$
DECLARE
    v_credits INTEGER;
    v_allowed BOOLEAN;
    v_remaining INTEGER;
BEGIN
    -- Get credits balance
    v_credits := public.get_credits_balance(p_tenant_id, p_feature_key);

    -- Check quota first
    IF p_quota_limit = -1 OR p_current_usage < p_quota_limit THEN
        v_allowed := true;
        v_remaining := CASE WHEN p_quota_limit = -1 THEN -1 ELSE GREATEST(0, p_quota_limit - p_current_usage) END;

        RETURN QUERY SELECT
            true,
            'quota'::VARCHAR(20),
            p_current_usage,
            p_quota_limit,
            v_remaining,
            v_credits;
        RETURN;
    END IF;

    -- If quota exhausted but credits available, allow with credits
    IF v_credits > 0 THEN
        RETURN QUERY SELECT
            true,
            'credits'::VARCHAR(20),
            p_current_usage,
            p_quota_limit,
            0,
            v_credits;
        RETURN;
    END IF;

    -- Neither quota nor credits available
    RETURN QUERY SELECT
        false,
        'none'::VARCHAR(20),
        p_current_usage,
        p_quota_limit,
        0,
        0;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

-- Auto-update updated_at column on tenant_credits
DROP TRIGGER IF EXISTS update_credits_updated_at ON public.tenant_credits;
CREATE TRIGGER update_credits_updated_at
    BEFORE UPDATE ON public.tenant_credits
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_credits TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_purchases TO CURRENT_USER;
GRANT SELECT, INSERT ON public.credit_usage_log TO CURRENT_USER;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 005: Credits system initialized (Stripe-ready)';
END $$;
