-- =========================
-- Seed Script 007: Features and Plans
-- =========================
-- Description: Seed feature catalog, plan catalog, and plan-feature matrix
-- Idempotent: Uses ON CONFLICT DO UPDATE
-- Note: This seed exists for reference/admin UI. Code constants are the runtime source of truth.
-- =========================

BEGIN;

-- =========================
-- Feature Catalog (15 features)
-- =========================

INSERT INTO public.features (key, name, description, feature_type, unit, creditable, is_active) VALUES
    ('documents_per_month', 'Documents Per Month', 'Number of documents that can be generated per billing period', 'quota', 'documents', true, true),
    ('template_library', 'Template Library', 'Access to template library (essential or full)', 'boolean', NULL, false, true),
    ('bilingual_quality', 'Bilingual Quality', 'Quality of bilingual document generation (standard or jais_native)', 'boolean', NULL, false, true),
    ('contract_reviews_per_month', 'Contract Reviews Per Month', 'Number of AI contract reviews per billing period', 'quota', 'reviews', true, true),
    ('risk_analysis_level', 'Risk Analysis Level', 'Level of risk analysis (none, critical_only, or full)', 'boolean', NULL, false, true),
    ('redlining_enabled', 'AI Redlining', 'AI suggests alternative compliant wording', 'boolean', NULL, false, true),
    ('localizer_check', 'Localizer Check', 'Flags governing law / jurisdiction mismatches', 'boolean', NULL, false, true),
    ('regulatory_hub_access', 'Regulatory Hub Access', 'Access to compliance dashboard', 'boolean', NULL, false, true),
    ('regulatory_queries_per_month', 'Regulatory Queries', 'Chat-with-Law queries per billing period', 'quota', 'queries', true, true),
    ('license_verifier_lookups', 'License Verifier Lookups', 'DED API lookups per billing period', 'quota', 'lookups', false, true),
    ('jurisdictions', 'Jurisdictions', 'Access to jurisdictions (single or all)', 'boolean', NULL, false, true),
    ('user_seats', 'User Seats', 'Maximum number of users in tenant', 'capacity', 'seats', false, true),
    ('data_isolation', 'Data Isolation', 'Level of data isolation (shared, row_level, or silo)', 'boolean', NULL, false, true),
    ('custom_playbooks', 'Custom Playbooks', 'Upload company-specific negotiating positions', 'boolean', NULL, false, true),
    ('white_label_exports', 'White Label Exports', 'Export reports with tenant branding', 'boolean', NULL, false, true)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    feature_type = EXCLUDED.feature_type,
    unit = EXCLUDED.unit,
    creditable = EXCLUDED.creditable,
    is_active = EXCLUDED.is_active,
    updated_at = now();

-- =========================
-- Plan Catalog (4 tiers)
-- =========================

INSERT INTO public.plans (key, name, description, price_monthly, price_currency, billing_period, is_active, sort_order) VALUES
    ('navigator', 'Navigator', 'Lead magnet — Regulatory Watch + basic Chat with Law', 0.00, 'AED', 'monthly', true, 1),
    ('shield', 'Shield', 'Solo entrepreneurs — Essential templates + basic analysis', 249.00, 'AED', 'monthly', true, 2),
    ('general_counsel', 'General Counsel', 'Active SMEs — Full library + Jais-native Arabic + redlining', 599.00, 'AED', 'monthly', true, 3),
    ('infrastructure', 'Infrastructure', 'Agencies — Silo isolation + custom playbooks + white-label', 2499.00, 'AED', 'monthly', true, 4)
ON CONFLICT (key) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    price_monthly = EXCLUDED.price_monthly,
    price_currency = EXCLUDED.price_currency,
    billing_period = EXCLUDED.billing_period,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order,
    updated_at = now();

-- =========================
-- Plan Entitlements Matrix (4 plans x 15 features = 60 rows)
-- =========================

-- Helper: Get plan and feature IDs for entitlement inserts
DO $$
DECLARE
    navigator_id UUID;
    shield_id UUID;
    general_counsel_id UUID;
    infrastructure_id UUID;
    
    documents_per_month_id UUID;
    template_library_id UUID;
    bilingual_quality_id UUID;
    contract_reviews_per_month_id UUID;
    risk_analysis_level_id UUID;
    redlining_enabled_id UUID;
    localizer_check_id UUID;
    regulatory_hub_access_id UUID;
    regulatory_queries_per_month_id UUID;
    license_verifier_lookups_id UUID;
    jurisdictions_id UUID;
    user_seats_id UUID;
    data_isolation_id UUID;
    custom_playbooks_id UUID;
    white_label_exports_id UUID;
BEGIN
    -- Get plan IDs
    SELECT id INTO navigator_id FROM public.plans WHERE key = 'navigator';
    SELECT id INTO shield_id FROM public.plans WHERE key = 'shield';
    SELECT id INTO general_counsel_id FROM public.plans WHERE key = 'general_counsel';
    SELECT id INTO infrastructure_id FROM public.plans WHERE key = 'infrastructure';
    
    -- Get feature IDs
    SELECT id INTO documents_per_month_id FROM public.features WHERE key = 'documents_per_month';
    SELECT id INTO template_library_id FROM public.features WHERE key = 'template_library';
    SELECT id INTO bilingual_quality_id FROM public.features WHERE key = 'bilingual_quality';
    SELECT id INTO contract_reviews_per_month_id FROM public.features WHERE key = 'contract_reviews_per_month';
    SELECT id INTO risk_analysis_level_id FROM public.features WHERE key = 'risk_analysis_level';
    SELECT id INTO redlining_enabled_id FROM public.features WHERE key = 'redlining_enabled';
    SELECT id INTO localizer_check_id FROM public.features WHERE key = 'localizer_check';
    SELECT id INTO regulatory_hub_access_id FROM public.features WHERE key = 'regulatory_hub_access';
    SELECT id INTO regulatory_queries_per_month_id FROM public.features WHERE key = 'regulatory_queries_per_month';
    SELECT id INTO license_verifier_lookups_id FROM public.features WHERE key = 'license_verifier_lookups';
    SELECT id INTO jurisdictions_id FROM public.features WHERE key = 'jurisdictions';
    SELECT id INTO user_seats_id FROM public.features WHERE key = 'user_seats';
    SELECT id INTO data_isolation_id FROM public.features WHERE key = 'data_isolation';
    SELECT id INTO custom_playbooks_id FROM public.features WHERE key = 'custom_playbooks';
    SELECT id INTO white_label_exports_id FROM public.features WHERE key = 'white_label_exports';
    
    -- =========================
    -- NAVIGATOR Plan Entitlements
    -- =========================
    INSERT INTO public.plan_entitlements (plan_id, feature_id, value_bool, value_int, value_text) VALUES
        (navigator_id, documents_per_month_id, NULL, 3, NULL),
        (navigator_id, template_library_id, NULL, NULL, 'essential'),
        (navigator_id, bilingual_quality_id, NULL, NULL, 'standard'),
        (navigator_id, contract_reviews_per_month_id, NULL, 0, NULL),
        (navigator_id, risk_analysis_level_id, NULL, NULL, 'none'),
        (navigator_id, redlining_enabled_id, false, NULL, NULL),
        (navigator_id, localizer_check_id, false, NULL, NULL),
        (navigator_id, regulatory_hub_access_id, true, NULL, NULL),
        (navigator_id, regulatory_queries_per_month_id, NULL, 5, NULL),
        (navigator_id, license_verifier_lookups_id, NULL, 0, NULL),
        (navigator_id, jurisdictions_id, NULL, NULL, 'single'),
        (navigator_id, user_seats_id, NULL, 1, NULL),
        (navigator_id, data_isolation_id, NULL, NULL, 'shared'),
        (navigator_id, custom_playbooks_id, false, NULL, NULL),
        (navigator_id, white_label_exports_id, false, NULL, NULL)
    ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        value_bool = EXCLUDED.value_bool,
        value_int = EXCLUDED.value_int,
        value_text = EXCLUDED.value_text;
    
    -- =========================
    -- SHIELD Plan Entitlements
    -- =========================
    INSERT INTO public.plan_entitlements (plan_id, feature_id, value_bool, value_int, value_text) VALUES
        (shield_id, documents_per_month_id, NULL, 25, NULL),
        (shield_id, template_library_id, NULL, NULL, 'essential'),
        (shield_id, bilingual_quality_id, NULL, NULL, 'standard'),
        (shield_id, contract_reviews_per_month_id, NULL, 5, NULL),
        (shield_id, risk_analysis_level_id, NULL, NULL, 'critical_only'),
        (shield_id, redlining_enabled_id, false, NULL, NULL),
        (shield_id, localizer_check_id, false, NULL, NULL),
        (shield_id, regulatory_hub_access_id, true, NULL, NULL),
        (shield_id, regulatory_queries_per_month_id, NULL, 20, NULL),
        (shield_id, license_verifier_lookups_id, NULL, 5, NULL),
        (shield_id, jurisdictions_id, NULL, NULL, 'single'),
        (shield_id, user_seats_id, NULL, 3, NULL),
        (shield_id, data_isolation_id, NULL, NULL, 'shared'),
        (shield_id, custom_playbooks_id, false, NULL, NULL),
        (shield_id, white_label_exports_id, false, NULL, NULL)
    ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        value_bool = EXCLUDED.value_bool,
        value_int = EXCLUDED.value_int,
        value_text = EXCLUDED.value_text;
    
    -- =========================
    -- GENERAL_COUNSEL Plan Entitlements
    -- =========================
    INSERT INTO public.plan_entitlements (plan_id, feature_id, value_bool, value_int, value_text) VALUES
        (general_counsel_id, documents_per_month_id, NULL, 100, NULL),
        (general_counsel_id, template_library_id, NULL, NULL, 'full'),
        (general_counsel_id, bilingual_quality_id, NULL, NULL, 'jais_native'),
        (general_counsel_id, contract_reviews_per_month_id, NULL, 30, NULL),
        (general_counsel_id, risk_analysis_level_id, NULL, NULL, 'full'),
        (general_counsel_id, redlining_enabled_id, true, NULL, NULL),
        (general_counsel_id, localizer_check_id, true, NULL, NULL),
        (general_counsel_id, regulatory_hub_access_id, true, NULL, NULL),
        (general_counsel_id, regulatory_queries_per_month_id, NULL, 100, NULL),
        (general_counsel_id, license_verifier_lookups_id, NULL, 20, NULL),
        (general_counsel_id, jurisdictions_id, NULL, NULL, 'all'),
        (general_counsel_id, user_seats_id, NULL, 10, NULL),
        (general_counsel_id, data_isolation_id, NULL, NULL, 'row_level'),
        (general_counsel_id, custom_playbooks_id, false, NULL, NULL),
        (general_counsel_id, white_label_exports_id, false, NULL, NULL)
    ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        value_bool = EXCLUDED.value_bool,
        value_int = EXCLUDED.value_int,
        value_text = EXCLUDED.value_text;
    
    -- =========================
    -- INFRASTRUCTURE Plan Entitlements
    -- =========================
    INSERT INTO public.plan_entitlements (plan_id, feature_id, value_bool, value_int, value_text) VALUES
        (infrastructure_id, documents_per_month_id, NULL, -1, NULL), -- -1 = unlimited
        (infrastructure_id, template_library_id, NULL, NULL, 'full'),
        (infrastructure_id, bilingual_quality_id, NULL, NULL, 'jais_native'),
        (infrastructure_id, contract_reviews_per_month_id, NULL, -1, NULL), -- unlimited
        (infrastructure_id, risk_analysis_level_id, NULL, NULL, 'full'),
        (infrastructure_id, redlining_enabled_id, true, NULL, NULL),
        (infrastructure_id, localizer_check_id, true, NULL, NULL),
        (infrastructure_id, regulatory_hub_access_id, true, NULL, NULL),
        (infrastructure_id, regulatory_queries_per_month_id, NULL, -1, NULL), -- unlimited
        (infrastructure_id, license_verifier_lookups_id, NULL, -1, NULL), -- unlimited
        (infrastructure_id, jurisdictions_id, NULL, NULL, 'all'),
        (infrastructure_id, user_seats_id, NULL, -1, NULL), -- unlimited
        (infrastructure_id, data_isolation_id, NULL, NULL, 'silo'),
        (infrastructure_id, custom_playbooks_id, true, NULL, NULL),
        (infrastructure_id, white_label_exports_id, true, NULL, NULL)
    ON CONFLICT (plan_id, feature_id) DO UPDATE SET
        value_bool = EXCLUDED.value_bool,
        value_int = EXCLUDED.value_int,
        value_text = EXCLUDED.value_text;
END $$;

COMMIT;

-- =========================
-- Verification Query
-- =========================
-- Run this to verify the seed data:
-- SELECT 
--     p.key as plan_key,
--     f.key as feature_key,
--     pe.value_bool,
--     pe.value_int,
--     pe.value_text
-- FROM public.plan_entitlements pe
-- JOIN public.plans p ON p.id = pe.plan_id
-- JOIN public.features f ON f.id = pe.feature_id
-- ORDER BY p.sort_order, f.key;
