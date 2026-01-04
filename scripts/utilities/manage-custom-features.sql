-- ============================================================================
-- Custom Feature Management Script
-- ============================================================================
-- This script provides examples for managing custom workspace features
-- Use these queries to grant special customers custom feature access
-- ============================================================================

-- ============================================================================
-- 1. VIEW CURRENT WORKSPACE FEATURES
-- ============================================================================

-- View all workspaces with their plan and features
SELECT 
    workspace_id,
    email,
    plan,
    features,
    is_active,
    created_at
FROM public.workspaces
ORDER BY created_at DESC;

-- View a specific workspace's features
SELECT 
    workspace_id,
    email,
    plan,
    features
FROM public.workspaces
WHERE workspace_id = 'YOUR_WORKSPACE_ID_HERE';

-- ============================================================================
-- 2. GRANT INDIVIDUAL FEATURE OVERRIDES
-- ============================================================================

-- Enable analyzer for a basic plan user (normally pro+ only)
UPDATE public.workspaces 
SET 
    features = '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_123';

-- Enable checklist for early access user
UPDATE public.workspaces 
SET 
    features = '{"checklist_access": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_456';

-- Custom document limit for a specific customer
UPDATE public.workspaces 
SET 
    features = '{"document_limit": 200}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_789';

-- ============================================================================
-- 3. MULTIPLE FEATURE OVERRIDES
-- ============================================================================

-- Grant multiple custom features to a special customer
UPDATE public.workspaces 
SET 
    features = '{
        "document_limit": 150,
        "analyzer_enabled": true,
        "checklist_access": true
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_special_customer';

-- Beta tester: Give early access user pro features temporarily
UPDATE public.workspaces 
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
UPDATE public.workspaces 
SET 
    features = jsonb_set(
        features,
        '{analyzer_enabled}',
        'true'::jsonb,
        true
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_123';

-- Add multiple features while preserving others
UPDATE public.workspaces 
SET 
    features = features || '{
        "analyzer_enabled": true,
        "document_limit": 100
    }'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_123';

-- ============================================================================
-- 5. REMOVE CUSTOM FEATURES (REVERT TO PLAN DEFAULTS)
-- ============================================================================

-- Remove all custom features (workspace will use plan defaults)
UPDATE public.workspaces 
SET 
    features = '{}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_123';

-- Remove a specific custom feature (others preserved)
UPDATE public.workspaces 
SET 
    features = features - 'analyzer_enabled',
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_123';

-- ============================================================================
-- 6. BULK OPERATIONS
-- ============================================================================

-- Grant analyzer to all basic plan users for a promotion
UPDATE public.workspaces 
SET 
    features = features || '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'basic' AND is_active = true;

-- Increase document limit for all early access users
UPDATE public.workspaces 
SET 
    features = features || '{"document_limit": 25}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'early_access' AND is_active = true;

-- Reset all custom features for a specific plan
UPDATE public.workspaces 
SET 
    features = '{}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE plan = 'basic';

-- ============================================================================
-- 7. QUERIES FOR REPORTING
-- ============================================================================

-- Find all workspaces with custom features
SELECT 
    workspace_id,
    email,
    plan,
    features
FROM public.workspaces
WHERE features != '{}'::jsonb
ORDER BY plan, email;

-- Count workspaces by plan
SELECT 
    plan,
    COUNT(*) as workspace_count,
    COUNT(CASE WHEN features != '{}'::jsonb THEN 1 END) as with_custom_features
FROM public.workspaces
WHERE is_active = true
GROUP BY plan
ORDER BY 
    CASE plan
        WHEN 'enterprise' THEN 1
        WHEN 'pro' THEN 2
        WHEN 'basic' THEN 3
        WHEN 'early_access' THEN 4
    END;

-- Find workspaces with specific feature enabled
SELECT 
    workspace_id,
    email,
    plan,
    features
FROM public.workspaces
WHERE (features->>'analyzer_enabled')::boolean = true
ORDER BY plan, email;

-- Find workspaces with custom document limits
SELECT 
    workspace_id,
    email,
    plan,
    (features->>'document_limit')::int as custom_limit
FROM public.workspaces
WHERE features ? 'document_limit'
ORDER BY custom_limit DESC;

-- ============================================================================
-- 8. VALIDATION QUERIES
-- ============================================================================

-- Check if custom features are valid JSON
SELECT 
    workspace_id,
    email,
    features,
    CASE 
        WHEN jsonb_typeof(features) = 'object' THEN 'Valid'
        ELSE 'Invalid'
    END as validation_status
FROM public.workspaces;

-- Find workspaces with potentially problematic feature configurations
SELECT 
    workspace_id,
    email,
    plan,
    features,
    CASE
        WHEN (features->>'document_limit')::int < -1 THEN 'Invalid document_limit'
        WHEN features ? 'unknown_feature' THEN 'Unknown feature present'
        ELSE 'OK'
    END as issue
FROM public.workspaces
WHERE features != '{}'::jsonb;

-- ============================================================================
-- 9. EXAMPLE USE CASES
-- ============================================================================

-- Use Case 1: Enterprise Trial
-- Give a basic plan customer enterprise features for 30 days
-- (Note: You'll need to manually revert after trial period)
UPDATE public.workspaces 
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
UPDATE public.workspaces 
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
UPDATE public.workspaces 
SET 
    features = '{"analyzer_enabled": true}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_custom_deal';

-- Use Case 4: Temporary Limit Increase
-- Customer needs extra documents for a project
UPDATE public.workspaces 
SET 
    features = '{"document_limit": 150}'::jsonb,
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_id = 'workspace_project_boost';

-- ============================================================================
-- 10. MAINTENANCE & CLEANUP
-- ============================================================================

-- Find inactive workspaces with custom features (potential cleanup)
SELECT 
    workspace_id,
    email,
    plan,
    features,
    is_active,
    updated_at
FROM public.workspaces
WHERE features != '{}'::jsonb 
  AND is_active = false
ORDER BY updated_at DESC;

-- Archive: Store custom features history before cleanup (optional)
-- You would create a separate history table for this

-- Reset custom features for inactive workspaces
UPDATE public.workspaces 
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
--    - Use bulk operations carefully (test on one workspace first)
--
-- ============================================================================

