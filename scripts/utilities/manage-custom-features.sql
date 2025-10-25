-- ============================================================================
-- Custom Feature Management Script
-- ============================================================================
-- This script provides examples for managing custom tenant features
-- Use these queries to grant special customers custom feature access
-- ============================================================================

-- ============================================================================
-- 1. VIEW CURRENT TENANT FEATURES
-- ============================================================================

-- View all tenants with their plan and features
SELECT 
    tenant_id,
    email,
    plan,
    features,
    is_active,
    created_at
FROM public.tenants
ORDER BY created_at DESC;

-- View a specific tenant's features
SELECT 
    tenant_id,
    email,
    plan,
    features
FROM public.tenants
WHERE tenant_id = 'YOUR_TENANT_ID_HERE';

-- ============================================================================
-- 2. GRANT INDIVIDUAL FEATURE OVERRIDES
-- ============================================================================

-- Enable analyzer for a basic plan user (normally pro+ only)
UPDATE public.tenants 
SET 
    features = '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_123';

-- Enable checklist for early access user
UPDATE public.tenants 
SET 
    features = '{"checklist_access": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_456';

-- Custom document limit for a specific customer
UPDATE public.tenants 
SET 
    features = '{"document_limit": 200}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_789';

-- ============================================================================
-- 3. MULTIPLE FEATURE OVERRIDES
-- ============================================================================

-- Grant multiple custom features to a special customer
UPDATE public.tenants 
SET 
    features = '{
        "document_limit": 150,
        "analyzer_enabled": true,
        "checklist_access": true
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_special_customer';

-- Beta tester: Give early access user pro features temporarily
UPDATE public.tenants 
SET 
    features = '{
        "document_limit": 500,
        "analyzer_enabled": true,
        "checklist_access": true
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'beta-tester@example.com';

-- ============================================================================
-- 4. MERGE CUSTOM FEATURES (PRESERVE EXISTING)
-- ============================================================================

-- Add a feature while preserving existing custom features
-- This uses jsonb_set to add/update a single key
UPDATE public.tenants 
SET 
    features = jsonb_set(
        features,
        '{analyzer_enabled}',
        'true'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_123';

-- Add multiple features while preserving others
UPDATE public.tenants 
SET 
    features = features || '{
        "analyzer_enabled": true,
        "document_limit": 100
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_123';

-- ============================================================================
-- 5. REMOVE CUSTOM FEATURES (REVERT TO PLAN DEFAULTS)
-- ============================================================================

-- Remove all custom features (tenant will use plan defaults)
UPDATE public.tenants 
SET 
    features = '{}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_123';

-- Remove a specific custom feature (others preserved)
UPDATE public.tenants 
SET 
    features = features - 'analyzer_enabled',
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_123';

-- ============================================================================
-- 6. BULK OPERATIONS
-- ============================================================================

-- Grant analyzer to all basic plan users for a promotion
UPDATE public.tenants 
SET 
    features = features || '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'basic' AND is_active = true;

-- Increase document limit for all early access users
UPDATE public.tenants 
SET 
    features = features || '{"document_limit": 25}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'early_access' AND is_active = true;

-- Reset all custom features for a specific plan
UPDATE public.tenants 
SET 
    features = '{}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'basic';

-- ============================================================================
-- 7. QUERIES FOR REPORTING
-- ============================================================================

-- Find all tenants with custom features
SELECT 
    tenant_id,
    email,
    plan,
    features
FROM public.tenants
WHERE features != '{}'::jsonb
ORDER BY plan, email;

-- Count tenants by plan
SELECT 
    plan,
    COUNT(*) as tenant_count,
    COUNT(CASE WHEN features != '{}'::jsonb THEN 1 END) as with_custom_features
FROM public.tenants
WHERE is_active = true
GROUP BY plan
ORDER BY 
    CASE plan
        WHEN 'enterprise' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'basic' THEN 3
        WHEN 'early_access' THEN 4
    END;

-- Find tenants with specific feature enabled
SELECT 
    tenant_id,
    email,
    plan,
    features
FROM public.tenants
WHERE (features->>'analyzer_enabled')::boolean = true
ORDER BY plan, email;

-- Find tenants with custom document limits
SELECT 
    tenant_id,
    email,
    plan,
    (features->>'document_limit')::int as custom_limit
FROM public.tenants
WHERE features ? 'document_limit'
ORDER BY custom_limit DESC;

-- ============================================================================
-- 8. VALIDATION QUERIES
-- ============================================================================

-- Check if custom features are valid JSON
SELECT 
    tenant_id,
    email,
    features,
    CASE 
        WHEN jsonb_typeof(features) = 'object' THEN 'Valid'
        ELSE 'Invalid'
    END as validation_status
FROM public.tenants;

-- Find tenants with potentially problematic feature configurations
SELECT 
    tenant_id,
    email,
    plan,
    features,
    CASE
        WHEN (features->>'document_limit')::int < -1 THEN 'Invalid document_limit'
        WHEN features ? 'unknown_feature' THEN 'Unknown feature present'
        ELSE 'OK'
    END as issue
FROM public.tenants
WHERE features != '{}'::jsonb;

-- ============================================================================
-- 9. EXAMPLE USE CASES
-- ============================================================================

-- Use Case 1: Enterprise Trial
-- Give a basic plan customer enterprise features for 30 days
-- (Note: You'll need to manually revert after trial period)
UPDATE public.tenants 
SET 
    features = '{
        "document_limit": -1,
        "analyzer_enabled": true,
        "checklist_access": true
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'trial-customer@company.com';
-- Remember to revert after 30 days!

-- Use Case 2: Partnership Deal
-- Partner gets pro features but on basic plan pricing
UPDATE public.tenants 
SET 
    features = '{
        "document_limit": 500,
        "analyzer_enabled": true,
        "checklist_access": true
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'partner@partnercompany.com';

-- Use Case 3: Granular Upsell
-- Basic customer wants ONLY analyzer, not full pro plan
UPDATE public.tenants 
SET 
    features = '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_custom_deal';

-- Use Case 4: Temporary Limit Increase
-- Customer needs extra documents for a project
UPDATE public.tenants 
SET 
    features = '{"document_limit": 150}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE tenant_id = 'tenant_project_boost';

-- ============================================================================
-- 10. MAINTENANCE & CLEANUP
-- ============================================================================

-- Find inactive tenants with custom features (potential cleanup)
SELECT 
    tenant_id,
    email,
    plan,
    features,
    is_active,
    updated_at
FROM public.tenants
WHERE features != '{}'::jsonb 
  AND is_active = false
ORDER BY updated_at DESC;

-- Archive: Store custom features history before cleanup (optional)
-- You would create a separate history table for this

-- Reset custom features for inactive tenants
UPDATE public.tenants 
SET 
    features = '{}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE is_active = false AND features != '{}'::jsonb;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- 1. JSONB Operators:
--    - '||' : Merge objects (right side overwrites left)
--    - '-'  : Remove key
--    - '?'  : Key exists
--    - '->>' : Get value as text
--
-- 2. Feature Behavior:
--    - Custom features OVERRIDE plan defaults
--    - Missing features fall back to plan defaults
--    - Use {} to clear custom features
--
-- 3. Document Limit:
--    - -1 = unlimited
--    - 0 = no access
--    - positive number = limit
--
-- 4. Best Practices:
--    - Always set updated_at when modifying features
--    - Document WHY custom features were granted (in a separate tracking system)
--    - Review custom features regularly
--    - Use bulk operations carefully (test on one tenant first)
--
-- ============================================================================

