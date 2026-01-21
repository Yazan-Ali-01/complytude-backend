-- ============================================================================
-- Migration 004: Plan-Based Entitlements System
-- ============================================================================

-- 1. Update plan constraint to new plans only
ALTER TABLE public.tenants
DROP CONSTRAINT IF EXISTS tenants_plan_check;

ALTER TABLE public.tenants
ADD CONSTRAINT tenants_plan_check
CHECK (plan IN ('navigator', 'shield', 'general_counsel', 'infrastructure'));

-- 2. Drop legacy features JSONB column (not in production)
ALTER TABLE public.tenants DROP COLUMN IF EXISTS features;

-- 3. Features Registry Table
CREATE TABLE IF NOT EXISTS public.features (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    data_type VARCHAR(50) NOT NULL CHECK (data_type IN ('boolean', 'integer', 'string', 'array')),
    category VARCHAR(100) NOT NULL,
    default_value JSONB NOT NULL,
    metadata JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_features_key ON public.features(key);
CREATE INDEX idx_features_category ON public.features(category);

-- 4. Tenant Feature Overrides Table (with audit trail)
CREATE TABLE IF NOT EXISTS public.tenant_feature_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
    override_value JSONB NOT NULL,

    -- Audit trail (UAE PDPL compliance)
    reason TEXT NOT NULL,
    granted_by VARCHAR(255) NOT NULL,
    granted_at TIMESTAMPTZ DEFAULT now(),

    -- Expiration support
    expires_at TIMESTAMPTZ,

    -- Revocation tracking
    revoked_at TIMESTAMPTZ,
    revoked_by VARCHAR(255),
    revoke_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(tenant_id, feature_key, granted_at)
);

CREATE INDEX idx_overrides_tenant ON public.tenant_feature_overrides(tenant_id);
CREATE INDEX idx_overrides_feature ON public.tenant_feature_overrides(feature_key);
CREATE INDEX idx_overrides_expires ON public.tenant_feature_overrides(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_overrides_active ON public.tenant_feature_overrides(tenant_id, feature_key)
    WHERE revoked_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP);

-- 5. Tenant Usage Table
CREATE TABLE IF NOT EXISTS public.tenant_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
    billing_period_start DATE NOT NULL,
    billing_period_end DATE NOT NULL,
    current_usage INTEGER NOT NULL DEFAULT 0,
    usage_limit INTEGER NOT NULL,
    last_usage_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(tenant_id, feature_key, billing_period_start)
);

CREATE INDEX idx_usage_tenant ON public.tenant_usage(tenant_id);
CREATE INDEX idx_usage_period ON public.tenant_usage(billing_period_start, billing_period_end);

-- 6. Usage Log Table (audit trail)
CREATE TABLE IF NOT EXISTS public.tenant_usage_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL,
    feature_key VARCHAR(100) NOT NULL,
    action VARCHAR(50) NOT NULL CHECK (action IN ('increment', 'decrement', 'reset', 'limit_change')),
    previous_value INTEGER NOT NULL,
    new_value INTEGER NOT NULL,
    delta INTEGER NOT NULL,
    user_id VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_usage_log_tenant ON public.tenant_usage_log(tenant_id);
CREATE INDEX idx_usage_log_created ON public.tenant_usage_log(created_at);

-- 7. Tenant Credits Table (Stripe-ready add-on system)
CREATE TABLE IF NOT EXISTS public.tenant_credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
    credits_remaining INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE(tenant_id, feature_key)
);

CREATE INDEX idx_credits_tenant ON public.tenant_credits(tenant_id);
CREATE INDEX idx_credits_feature ON public.tenant_credits(feature_key);

COMMENT ON TABLE public.tenant_credits IS 'Purchased add-on credits balance per feature (Stripe-ready)';

-- 8. Credit Purchases Table (audit trail for payments)
CREATE TABLE IF NOT EXISTS public.credit_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id VARCHAR(255) NOT NULL REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    feature_key VARCHAR(100) NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
    credits_purchased INTEGER NOT NULL,
    price_aed DECIMAL(10,2) NOT NULL,

    -- Stripe integration (NULL until connected)
    stripe_payment_intent_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending' CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),

    -- Audit trail
    purchased_by VARCHAR(255) REFERENCES public.users(id),
    purchased_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_purchases_tenant ON public.credit_purchases(tenant_id);
CREATE INDEX idx_purchases_status ON public.credit_purchases(payment_status);
CREATE INDEX idx_purchases_stripe ON public.credit_purchases(stripe_payment_intent_id) WHERE stripe_payment_intent_id IS NOT NULL;

COMMENT ON TABLE public.credit_purchases IS 'Credit purchase history with Stripe payment tracking';

-- 9. Credit Usage Log (when credits are consumed)
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
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_credit_usage_tenant ON public.credit_usage_log(tenant_id);
CREATE INDEX idx_credit_usage_created ON public.credit_usage_log(created_at);

-- 10. Seed Feature Definitions
INSERT INTO public.features (key, name, description, data_type, category, default_value) VALUES
    -- Document Generation
    ('documents_per_month', 'Documents Per Month', 'Maximum documents per month (-1 = unlimited)', 'integer', 'document_generation', '0'),
    ('template_library', 'Template Library', 'Access level: none, basic, full', 'string', 'document_generation', '"none"'),
    ('bilingual_quality', 'Bilingual Quality', 'Quality level: none, standard, premium', 'string', 'document_generation', '"none"'),

    -- Contract Analysis
    ('contract_reviews_per_month', 'Contract Reviews Per Month', 'Maximum reviews per month', 'integer', 'contract_analysis', '0'),
    ('risk_analysis_level', 'Risk Analysis Level', 'Depth: none, basic, advanced, comprehensive', 'string', 'contract_analysis', '"none"'),
    ('redlining_enabled', 'Redlining Enabled', 'Contract redlining feature', 'boolean', 'contract_analysis', 'false'),
    ('localizer_check', 'Localizer Check', 'Jurisdiction compliance check', 'boolean', 'contract_analysis', 'false'),

    -- Regulatory Hub
    ('regulatory_hub_access', 'Regulatory Hub Access', 'Access to regulatory dashboard', 'boolean', 'regulatory_hub', 'false'),
    ('regulatory_queries_per_month', 'Regulatory Queries', 'Chat-with-Law queries per month', 'integer', 'regulatory_hub', '0'),
    ('license_verifier_lookups', 'License Verifier Lookups', 'DED API lookups per month', 'integer', 'regulatory_hub', '0'),

    -- Jurisdiction
    ('jurisdictions', 'Available Jurisdictions', 'List of jurisdiction codes', 'array', 'jurisdiction', '["UAE"]'),
    ('selected_jurisdiction', 'Selected Jurisdiction', 'Current jurisdiction', 'string', 'jurisdiction', '"UAE"'),

    -- Seats & Isolation
    ('user_seats', 'User Seats', 'Maximum users (-1 = unlimited)', 'integer', 'seats_isolation', '1'),
    ('data_isolation', 'Data Isolation', 'Level: shared, dedicated', 'string', 'seats_isolation', '"shared"'),
    ('custom_playbooks', 'Custom Playbooks', 'Custom playbook creation', 'boolean', 'seats_isolation', 'false'),
    ('white_label_exports', 'White Label Exports', 'Branded exports', 'boolean', 'seats_isolation', 'false')
ON CONFLICT (key) DO NOTHING;

-- 11. Helper Functions

-- Get active overrides for a tenant
CREATE OR REPLACE FUNCTION public.get_active_overrides(p_tenant_id VARCHAR)
RETURNS TABLE (feature_key VARCHAR(100), override_value JSONB, expires_at TIMESTAMPTZ) AS $$
BEGIN
    RETURN QUERY
    SELECT tfo.feature_key, tfo.override_value, tfo.expires_at
    FROM public.tenant_feature_overrides tfo
    WHERE tfo.tenant_id = p_tenant_id
      AND tfo.revoked_at IS NULL
      AND (tfo.expires_at IS NULL OR tfo.expires_at > CURRENT_TIMESTAMP)
    ORDER BY tfo.granted_at DESC;
END;
$$ LANGUAGE plpgsql;

-- Get billing period
CREATE OR REPLACE FUNCTION public.get_billing_period(p_date DATE DEFAULT CURRENT_DATE)
RETURNS TABLE (period_start DATE, period_end DATE) AS $$
BEGIN
    RETURN QUERY
    SELECT
        DATE_TRUNC('month', p_date)::DATE,
        (DATE_TRUNC('month', p_date) + INTERVAL '1 month' - INTERVAL '1 day')::DATE;
END;
$$ LANGUAGE plpgsql;

-- Check usage limit
CREATE OR REPLACE FUNCTION public.check_usage_limit(p_tenant_id VARCHAR, p_feature_key VARCHAR)
RETURNS TABLE (allowed BOOLEAN, current_usage INTEGER, usage_limit INTEGER, remaining INTEGER) AS $$
DECLARE
    v_period_start DATE;
    v_usage RECORD;
BEGIN
    SELECT * INTO v_period_start FROM public.get_billing_period();

    SELECT tu.current_usage, tu.usage_limit INTO v_usage
    FROM public.tenant_usage tu
    WHERE tu.tenant_id = p_tenant_id
      AND tu.feature_key = p_feature_key
      AND tu.billing_period_start = v_period_start;

    IF v_usage IS NULL THEN
        RETURN QUERY SELECT true, 0, -1, -1;
        RETURN;
    END IF;

    IF v_usage.usage_limit = -1 THEN
        RETURN QUERY SELECT true, v_usage.current_usage, v_usage.usage_limit, -1;
        RETURN;
    END IF;

    RETURN QUERY SELECT
        v_usage.current_usage < v_usage.usage_limit,
        v_usage.current_usage,
        v_usage.usage_limit,
        GREATEST(0, v_usage.usage_limit - v_usage.current_usage);
END;
$$ LANGUAGE plpgsql;

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

-- Check usage with credits fallback
CREATE OR REPLACE FUNCTION public.check_usage_with_credits(
    p_tenant_id VARCHAR,
    p_feature_key VARCHAR
) RETURNS TABLE (
    allowed BOOLEAN,
    source VARCHAR(20),
    current_usage INTEGER,
    usage_limit INTEGER,
    remaining_quota INTEGER,
    credits_available INTEGER
) AS $$
DECLARE
    v_quota RECORD;
    v_credits INTEGER;
BEGIN
    -- Check quota first
    SELECT * INTO v_quota FROM public.check_usage_limit(p_tenant_id, p_feature_key);

    -- Get credits balance
    v_credits := public.get_credits_balance(p_tenant_id, p_feature_key);

    -- If quota allows, use quota
    IF v_quota.allowed THEN
        RETURN QUERY SELECT
            true,
            'quota'::VARCHAR(20),
            v_quota.current_usage,
            v_quota.usage_limit,
            v_quota.remaining,
            v_credits;
        RETURN;
    END IF;

    -- If quota exhausted but credits available, allow with credits
    IF v_credits > 0 THEN
        RETURN QUERY SELECT
            true,
            'credits'::VARCHAR(20),
            v_quota.current_usage,
            v_quota.usage_limit,
            0,
            v_credits;
        RETURN;
    END IF;

    -- Neither quota nor credits available
    RETURN QUERY SELECT
        false,
        'none'::VARCHAR(20),
        v_quota.current_usage,
        v_quota.usage_limit,
        0,
        0;
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
    SET credits_remaining = v_new, updated_at = now()
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
    DO UPDATE SET credits_remaining = tenant_credits.credits_remaining + p_amount, updated_at = now()
    RETURNING credits_remaining INTO v_new_balance;

    RETURN v_new_balance;
END;
$$ LANGUAGE plpgsql;

-- 12. Row Level Security
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_usage_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY features_read ON public.features FOR SELECT USING (true);
CREATE POLICY features_write ON public.features FOR ALL USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY overrides_tenant_read ON public.tenant_feature_overrides FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY overrides_admin_write ON public.tenant_feature_overrides FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY usage_tenant_read ON public.tenant_usage FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY usage_admin_write ON public.tenant_usage FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY usage_log_read ON public.tenant_usage_log FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY usage_log_write ON public.tenant_usage_log FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

-- Credits RLS
CREATE POLICY credits_tenant_read ON public.tenant_credits FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY credits_admin_write ON public.tenant_credits FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY purchases_tenant_read ON public.credit_purchases FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY purchases_admin_write ON public.credit_purchases FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');

CREATE POLICY credit_usage_read ON public.credit_usage_log FOR SELECT
    USING (tenant_id = current_setting('app.current_tenant_id', true) OR current_setting('app.bypass_rls', true) = 'true');
CREATE POLICY credit_usage_write ON public.credit_usage_log FOR ALL
    USING (current_setting('app.bypass_rls', true) = 'true');
