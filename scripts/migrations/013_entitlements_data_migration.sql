-- =========================
-- Migration 013: Plan Data Migration
-- =========================
-- Description: Migrates existing tenants from legacy plan values and features JSONB to new entitlements system
-- Note: Run AFTER code deployed with both old and new plan support
-- =========================

BEGIN;

-- =========================
-- Step 1: Migrate plan values
-- =========================
-- Update plan enum values from legacy to new naming convention
UPDATE public.tenants SET plan = 'navigator' WHERE plan = 'early_access';
UPDATE public.tenants SET plan = 'shield' WHERE plan = 'basic';
UPDATE public.tenants SET plan = 'general_counsel' WHERE plan = 'pro';
UPDATE public.tenants SET plan = 'infrastructure' WHERE plan = 'enterprise';

-- =========================
-- Step 2: Migrate legacy features to new feature keys
-- =========================
-- The tenants.features JSONB column may contain legacy feature overrides
-- We need to migrate these to the new normalized table structure

DO $$
DECLARE
    tenant_record RECORD;
    v_feature_key TEXT;
    v_feature_value JSONB;
    override_exists BOOLEAN;
BEGIN
    -- Iterate through tenants with legacy features
    FOR tenant_record IN
        SELECT id, features FROM public.tenants
        WHERE features IS NOT NULL
        AND features != '{}'::jsonb
    LOOP
        -- Process each legacy feature in the JSONB
        FOR v_feature_key, v_feature_value IN
            SELECT * FROM jsonb_each(tenant_record.features)
        LOOP
            -- Map legacy keys to new keys if needed
            CASE v_feature_key
                WHEN 'document_limit' THEN
                    v_feature_key := 'documents_per_month';
                WHEN 'checklist_access' THEN
                    v_feature_key := 'regulatory_hub_access';
                WHEN 'analyzer_enabled' THEN
                    v_feature_key := 'contract_reviews_per_month';
                ELSE
                    -- Keep original key
                    NULL;
            END CASE;

            -- Check if override already exists (use table alias to avoid variable/column name collision)
            SELECT EXISTS (
                SELECT 1 FROM public.tenant_feature_overrides tfo
                WHERE tfo.tenant_id = tenant_record.id
                AND tfo.feature_key = v_feature_key
            ) INTO override_exists;

            -- Only insert if override doesn't exist
            IF NOT override_exists THEN
                INSERT INTO public.tenant_feature_overrides (
                    tenant_id,
                    feature_key,
                    value,
                    granted_by,
                    granted_at,
                    reason,
                    expires_at
                ) VALUES (
                    tenant_record.id,
                    v_feature_key,
                    v_feature_value,
                    NULL,  -- system-generated
                    NOW(),
                    'Migrated from legacy features JSONB column',
                    NULL   -- permanent
                );
            END IF;
        END LOOP;
    END LOOP;
END $$;

-- =========================
-- Step 3: Log migration statistics
-- =========================
DO $$
DECLARE
    total_tenants INTEGER;
    migrated_tenants INTEGER;
    total_overrides INTEGER;
BEGIN
    SELECT COUNT(*) INTO total_tenants FROM public.tenants;
    SELECT COUNT(DISTINCT tenant_id) INTO migrated_tenants FROM public.tenant_feature_overrides WHERE reason = 'Migrated from legacy features JSONB column';
    SELECT COUNT(*) INTO total_overrides FROM public.tenant_feature_overrides;

    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Entitlements Migration Summary';
    RAISE NOTICE '==============================================';
    RAISE NOTICE 'Total tenants: %', total_tenants;
    RAISE NOTICE 'Tenants with migrated overrides: %', migrated_tenants;
    RAISE NOTICE 'Total overrides after migration: %', total_overrides;
    RAISE NOTICE '==============================================';
END $$;

-- =========================
-- Step 4: Validate migration
-- =========================
-- Ensure all plans are valid new values
DO $$
DECLARE
    invalid_plans INTEGER;
BEGIN
    SELECT COUNT(*) INTO invalid_plans
    FROM public.tenants
    WHERE plan IN ('early_access', 'basic', 'pro', 'enterprise');

    IF invalid_plans > 0 THEN
        RAISE EXCEPTION 'Migration failed: % tenants still have legacy plan values', invalid_plans;
    END IF;

    RAISE NOTICE 'Plan validation passed: All tenants have new plan values';
END $$;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;

-- Revert plan values
UPDATE public.tenants SET plan = 'early_access' WHERE plan = 'navigator';
UPDATE public.tenants SET plan = 'basic' WHERE plan = 'shield';
UPDATE public.tenants SET plan = 'pro' WHERE plan = 'general_counsel';
UPDATE public.tenants SET plan = 'enterprise' WHERE plan = 'infrastructure';

-- Note: We do NOT delete the migrated overrides
-- They can coexist with the legacy features JSONB
-- The FeaturesService will merge both sources

COMMIT;
*/

-- =========================
-- VERIFICATION QUERIES (run after migration)
-- =========================
/*
-- Check plan distribution
SELECT plan, COUNT(*) as tenant_count
FROM public.tenants
GROUP BY plan
ORDER BY plan;

-- Check override migration
SELECT
    SUBSTRING(reason, 1, 50) as migration_type,
    COUNT(*) as override_count
FROM public.tenant_feature_overrides
WHERE reason LIKE 'Migrated%'
GROUP BY SUBSTRING(reason, 1, 50);

-- Check features table
SELECT key, data_type, category FROM public.features ORDER BY sort_order;
*/