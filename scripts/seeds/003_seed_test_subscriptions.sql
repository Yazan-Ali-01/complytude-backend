-- =========================
-- Seed Script 003: Tenant Subscriptions
-- =========================
-- Description: Create active subscriptions for all tenants
-- Idempotent: Uses ON CONFLICT DO UPDATE
-- Note: Must run AFTER 004 (tenants) and 007 (plans)
-- =========================

BEGIN;

-- =========================
-- Create Subscriptions for All Tenants
-- =========================
-- Maps test tenants to their designated plans (hardcoded for seed data)
-- Note: tenant.plan column is REMOVED; subscriptions are the single source of truth
-- Dates are relative to NOW() for re-seeding compatibility

INSERT INTO public.tenant_subscriptions (
    id,
    tenant_id,
    plan_id,
    status,
    billing_period_start,
    billing_period_end,
    current_period_start,
    current_period_end,
    created_at,
    updated_at
)
SELECT
    gen_random_uuid(),
    t.id,
    p.id,
    'active',
    NOW() - INTERVAL '1 day',              -- Started yesterday
    NOW() + INTERVAL '30 days',            -- Billing ends in 30 days
    NOW() - INTERVAL '1 day',              -- Current period started yesterday
    NOW() + INTERVAL '30 days',            -- Current period ends in 30 days
    NOW(),
    NOW()
FROM public.tenants t
CROSS JOIN public.plans p
WHERE
    -- Map specific test tenants to their plans
    (t.id = '11111111-1111-4111-8111-111111111111' AND p.key = 'general_counsel')  -- Acme Legal LLC
    OR (t.id = '22222222-2222-4222-8222-222222222222' AND p.key = 'shield')        -- Shield Corp
    OR (t.id = '33333333-2222-4222-8222-333333333333' AND p.key = 'infrastructure') -- Infrastructure Inc
    -- For any other tenants (future additions), default to navigator plan
    OR (t.id NOT IN ('11111111-1111-4111-8111-111111111111',
                     '22222222-2222-4222-8222-222222222222',
                     '33333333-2222-4222-8222-333333333333')
        AND p.key = 'navigator')
ON CONFLICT (id) DO NOTHING;  -- Use id for conflict detection (primary key)

COMMIT;

-- =========================
-- Verification Query
-- =========================

DO $$
DECLARE
    subscription_count INT;
    rec RECORD;
BEGIN
    SELECT COUNT(*) INTO subscription_count
    FROM public.tenant_subscriptions
    WHERE status = 'active';

    RAISE NOTICE '=========================';
    RAISE NOTICE 'Subscription Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE '✅ Active subscriptions created: %', subscription_count;
    RAISE NOTICE '=========================';

    -- Show subscription details
    RAISE NOTICE 'Subscription Details:';
    FOR rec IN (
        SELECT
            t.name as tenant_name,
            t.slug as tenant_slug,
            p.key as subscription_plan,
            ts.status,
            ts.current_period_start::date as period_start,
            ts.current_period_end::date as period_end
        FROM public.tenant_subscriptions ts
        JOIN public.tenants t ON t.id = ts.tenant_id
        JOIN public.plans p ON p.id = ts.plan_id
        WHERE ts.status = 'active'
        ORDER BY t.name
    ) LOOP
        RAISE NOTICE '  % (@%) → % plan [% to %]',
            rec.tenant_name,
            rec.tenant_slug,
            rec.subscription_plan,
            rec.period_start,
            rec.period_end;
    END LOOP;
    RAISE NOTICE '=========================';
END $$;
