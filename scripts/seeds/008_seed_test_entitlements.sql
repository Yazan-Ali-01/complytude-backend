-- =========================
-- Seed Script 008: Test Entitlements Data
-- =========================
-- Description: Seed test data for entitlement system testing
-- Includes: subscriptions, add-ons, and admin overrides
-- Idempotent: Uses ON CONFLICT DO UPDATE
-- =========================

BEGIN;

-- =========================
-- Helper: Get IDs
-- =========================
DO $$
DECLARE
    tenant1_id UUID := '11111111-1111-4111-8111-111111111111';
    tenant2_id UUID := '22222222-2222-4222-8222-222222222222';
    tenant3_id UUID := '33333333-2222-4222-8222-333333333333';
    admin_user_id UUID := '99999999-9999-9999-9999-999999999999';
    
    navigator_plan_id UUID;
    shield_plan_id UUID;
    general_counsel_plan_id UUID;
    infrastructure_plan_id UUID;
    
    documents_feature_id UUID;
    contract_reviews_feature_id UUID;
    
    extra_docs_addon_id UUID;
    extra_reviews_addon_id UUID;
BEGIN
    -- Get plan IDs
    SELECT id INTO navigator_plan_id FROM public.plans WHERE key = 'navigator';
    SELECT id INTO shield_plan_id FROM public.plans WHERE key = 'shield';
    SELECT id INTO general_counsel_plan_id FROM public.plans WHERE key = 'general_counsel';
    SELECT id INTO infrastructure_plan_id FROM public.plans WHERE key = 'infrastructure';
    
    -- Get feature IDs
    SELECT id INTO documents_feature_id FROM public.features WHERE key = 'documents_per_month';
    SELECT id INTO contract_reviews_feature_id FROM public.features WHERE key = 'contract_reviews_per_month';
    
    -- =========================
    -- Tenant Subscriptions
    -- =========================
    -- Create active subscriptions for all test tenants
    -- Note: Delete existing active subscriptions first to avoid duplicates
    
    -- Delete existing active subscriptions for test tenants
    DELETE FROM public.tenant_subscriptions 
    WHERE tenant_id IN (tenant1_id, tenant2_id, tenant3_id) AND status = 'active';
    
    -- Tenant 1: general_counsel plan
    INSERT INTO public.tenant_subscriptions (
        tenant_id, 
        plan_id, 
        status, 
        billing_period_start, 
        billing_period_end,
        current_period_start, 
        current_period_end
    ) VALUES (
        tenant1_id,
        general_counsel_plan_id,
        'active',
        now() - interval '1 month',
        now() + interval '11 months',
        now(),
        now() + interval '1 month'
    );
    
    -- Tenant 2: shield plan
    INSERT INTO public.tenant_subscriptions (
        tenant_id, 
        plan_id, 
        status, 
        billing_period_start, 
        billing_period_end,
        current_period_start, 
        current_period_end
    ) VALUES (
        tenant2_id,
        shield_plan_id,
        'active',
        now() - interval '2 months',
        now() + interval '10 months',
        now(),
        now() + interval '1 month'
    );
    
    -- Tenant 3: infrastructure plan
    INSERT INTO public.tenant_subscriptions (
        tenant_id, 
        plan_id, 
        status, 
        billing_period_start, 
        billing_period_end,
        current_period_start, 
        current_period_end
    ) VALUES (
        tenant3_id,
        infrastructure_plan_id,
        'active',
        now() - interval '6 months',
        now() + interval '6 months',
        now(),
        now() + interval '1 month'
    );
    
    -- =========================
    -- Test Add-ons
    -- =========================
    -- Create sample add-ons in catalog
    
    INSERT INTO public.addons (key, name, description, price_monthly, is_active) VALUES
        ('extra_50_documents', 'Extra 50 Documents', 'Add 50 additional documents per month', 49.00, true),
        ('extra_10_contract_reviews', 'Extra 10 Contract Reviews', 'Add 10 additional contract reviews per month', 99.00, true)
    ON CONFLICT (key) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        price_monthly = EXCLUDED.price_monthly,
        is_active = EXCLUDED.is_active;
    
    -- Get addon IDs
    SELECT id INTO extra_docs_addon_id FROM public.addons WHERE key = 'extra_50_documents';
    SELECT id INTO extra_reviews_addon_id FROM public.addons WHERE key = 'extra_10_contract_reviews';
    
    -- Create addon entitlements
    INSERT INTO public.addon_entitlements (addon_id, feature_id, value_int) VALUES
        (extra_docs_addon_id, documents_feature_id, 50),
        (extra_reviews_addon_id, contract_reviews_feature_id, 10)
    ON CONFLICT (addon_id, feature_id) DO UPDATE SET
        value_int = EXCLUDED.value_int;
    
        -- =========================
        -- Tenant Add-ons (Active)
        -- =========================
        -- Tenant 2 (shield) has the extra documents add-on
        -- This will make their effective limit: 25 (plan) + 50 (addon) = 75 documents
        
        -- Delete existing addon subscriptions for test tenants
        DELETE FROM public.tenant_addons 
        WHERE tenant_id = tenant2_id AND addon_id = extra_docs_addon_id;
        
        INSERT INTO public.tenant_addons (
            tenant_id,
            addon_id,
            quantity,
            status,
            starts_at,
            expires_at
        ) VALUES (
            tenant2_id,
            extra_docs_addon_id,
            1,
            'active',
            now() - interval '1 month',
            now() + interval '11 months'
        );
    
    -- =========================
    -- Tenant Overrides (Admin)
    -- =========================
    -- Tenant 3 (infrastructure) has an override for testing
    -- Override: Set documents_per_month to exactly 500 (instead of unlimited -1)
    -- This demonstrates override precedence over plan
    
    -- Delete existing overrides for this tenant/feature
    DELETE FROM public.tenant_overrides 
    WHERE tenant_id = tenant3_id AND feature_id = documents_feature_id;
    
    INSERT INTO public.tenant_overrides (
        tenant_id,
        feature_id,
        value_int,
        reason,
        applied_by,
        starts_at,
        expires_at,
        is_active
    ) VALUES (
        tenant3_id,
        documents_feature_id,
        500,
        'Testing override precedence - limit infrastructure tenant for testing',
        admin_user_id,
        now(),
        now() + interval '6 months',
        true
    );
    
END $$;

COMMIT;

-- =========================
-- Verification Queries
-- =========================
-- Run these to verify the seed data:

-- Check subscriptions
-- SELECT 
--     t.id as tenant_id,
--     t.plan as tenant_plan,
--     p.key as subscription_plan,
--     ts.status,
--     ts.current_period_start,
--     ts.current_period_end
-- FROM public.tenants t
-- JOIN public.tenant_subscriptions ts ON ts.tenant_id = t.id
-- JOIN public.plans p ON p.id = ts.plan_id
-- ORDER BY t.id;

-- Check add-ons
-- SELECT 
--     t.id as tenant_id,
--     a.key as addon_key,
--     ta.quantity,
--     ta.status,
--     ae.value_int as addon_value
-- FROM public.tenant_addons ta
-- JOIN public.tenants t ON t.id = ta.tenant_id
-- JOIN public.addons a ON a.id = ta.addon_id
-- JOIN public.addon_entitlements ae ON ae.addon_id = ta.addon_id
-- WHERE ta.status = 'active';

-- Check overrides
-- SELECT 
--     t.id as tenant_id,
--     f.key as feature_key,
--     tor.value_int,
--     tor.reason,
--     tor.is_active
-- FROM public.tenant_overrides tor
-- JOIN public.tenants t ON t.id = tor.tenant_id
-- JOIN public.features f ON f.id = tor.feature_id
-- WHERE tor.is_active = true;
