-- =========================
-- Seed Script 004: Sample Templates
-- =========================
-- Description: Seed sample templates with versions for testing
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- Dependencies: Requires authorities, categories, and users to be seeded first
-- =========================

BEGIN;

-- =========================
-- Sample Templates
-- =========================
-- Note: created_by references test users from 003_seed_test_tenants_users.sql
-- Note: category_id and authority_id reference data from 001 and 002

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by)
SELECT
    '10000000-0000-0000-0000-000000000001'::UUID,
    'dmcc_employment_limited_en_v1',
    'DMCC Limited Employment Contract',
    'Standard fixed-term employment contract compliant with DMCC regulations and UAE Labor Law',
    c.id,
    a.id,
    ARRAY['en'],
    '1.0.0',
    'active',
    'essential',
    NULL,
    NULL,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'employment' AND a.code = 'DMCC'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by)
SELECT
    '10000000-0000-0000-0000-000000000002'::UUID,
    'difc_nda_mutual_en_v1',
    'DIFC Mutual Non-Disclosure Agreement',
    'Bilateral NDA template for DIFC-registered entities with common law provisions',
    c.id,
    a.id,
    ARRAY['en'],
    '1.0.0',
    'active',
    'essential',
    NULL,
    NULL,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'nda' AND a.code = 'DIFC'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by)
SELECT
    '10000000-0000-0000-0000-000000000003'::UUID,
    'ded_freelance_service_en_v1',
    'DED Freelance Service Agreement',
    'Freelance contractor agreement for DED mainland business activities',
    c.id,
    a.id,
    ARRAY['en'],
    '1.0.0',
    'active',
    'essential',
    NULL,
    NULL,
    'dddddddd-dddd-4ddd-dddd-dddddddddddd'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'freelance' AND a.code = 'DED'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by)
SELECT
    '10000000-0000-0000-0000-000000000004'::UUID,
    'adgm_partnership_agreement_en_v1',
    'ADGM Partnership Agreement',
    'Partnership agreement template for ADGM-registered entities',
    c.id,
    a.id,
    ARRAY['en'],
    '2.0.0',
    'active',
    'full',
    NULL,
    NULL,
    'ffffffff-ffff-4fff-ffff-ffffffffffff'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'partnership' AND a.code = 'ADGM'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, tier, file_url, thumbnail_url, created_by)
SELECT
    '10000000-0000-0000-0000-000000000005'::UUID,
    'ifza_commercial_lease_en_v1',
    'IFZA Commercial Lease Agreement',
    'Commercial property lease agreement for IFZA free zone',
    c.id,
    a.id,
    ARRAY['en'],
    '1.0.0',
    'active',
    'full',
    NULL,
    NULL,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'lease' AND a.code = 'IFZA'
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Template Versions
-- =========================

-- Version for DMCC Employment Contract
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000001',
    '1.0.0',
    '[
        {"key": "employee_name", "type": "text", "required": true, "label": "Employee Full Name"},
        {"key": "employee_id", "type": "text", "required": true, "label": "Employee ID"},
        {"key": "position", "type": "text", "required": true, "label": "Job Position"},
        {"key": "department", "type": "text", "required": false, "label": "Department"},
        {"key": "start_date", "type": "date", "required": true, "label": "Contract Start Date"},
        {"key": "end_date", "type": "date", "required": true, "label": "Contract End Date"},
        {"key": "salary", "type": "number", "required": true, "label": "Monthly Salary (AED)"},
        {"key": "probation_period", "type": "number", "required": false, "label": "Probation Period (days)", "default_value": 180}
    ]'::jsonb,
    NULL,
    'Initial version - DMCC compliance requirements',
    true,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version for DIFC NDA
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000002',
    '1.0.0',
    '[
        {"key": "party_a_name", "type": "text", "required": true, "label": "Party A Company Name"},
        {"key": "party_a_license", "type": "text", "required": true, "label": "Party A License Number"},
        {"key": "party_b_name", "type": "text", "required": true, "label": "Party B Company Name"},
        {"key": "party_b_license", "type": "text", "required": true, "label": "Party B License Number"},
        {"key": "effective_date", "type": "date", "required": true, "label": "Effective Date"},
        {"key": "disclosure_purpose", "type": "textarea", "required": true, "label": "Purpose of Disclosure"},
        {"key": "term_years", "type": "number", "required": true, "label": "Term (Years)", "default_value": 2}
    ]'::jsonb,
    NULL,
    'Initial version - DIFC common law provisions',
    true,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version for DED Freelance Service Agreement
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000003',
    '1.0.0',
    '[
        {"key": "contractor_name", "type": "text", "required": true, "label": "Contractor Full Name"},
        {"key": "contractor_license", "type": "text", "required": true, "label": "DED License Number"},
        {"key": "client_company", "type": "text", "required": true, "label": "Client Company Name"},
        {"key": "service_description", "type": "textarea", "required": true, "label": "Service Description"},
        {"key": "contract_value", "type": "number", "required": true, "label": "Contract Value (AED)"},
        {"key": "start_date", "type": "date", "required": true, "label": "Start Date"},
        {"key": "end_date", "type": "date", "required": true, "label": "End Date"},
        {"key": "payment_terms", "type": "text", "required": false, "label": "Payment Terms", "default_value": "Net 30"}
    ]'::jsonb,
    NULL,
    'Initial version - DED mainland freelance agreement',
    true,
    'dddddddd-dddd-4ddd-dddd-dddddddddddd'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version for IFZA Commercial Lease Agreement
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000005',
    '1.0.0',
    '[
        {"key": "landlord_name", "type": "text", "required": true, "label": "Landlord Name"},
        {"key": "tenant_company", "type": "text", "required": true, "label": "Tenant Company Name"},
        {"key": "tenant_license", "type": "text", "required": true, "label": "IFZA License Number"},
        {"key": "unit_number", "type": "text", "required": true, "label": "Unit Number"},
        {"key": "area_sqft", "type": "number", "required": true, "label": "Area (sq ft)"},
        {"key": "annual_rent", "type": "number", "required": true, "label": "Annual Rent (AED)"},
        {"key": "lease_start_date", "type": "date", "required": true, "label": "Lease Start Date"},
        {"key": "lease_end_date", "type": "date", "required": true, "label": "Lease End Date"},
        {"key": "security_deposit", "type": "number", "required": false, "label": "Security Deposit (AED)"}
    ]'::jsonb,
    NULL,
    'Initial version - IFZA commercial lease',
    true,
    'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version 1.0.0 for ADGM Partnership
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000004',
    '1.0.0',
    '[
        {"key": "partnership_name", "type": "text", "required": true, "label": "Partnership Name"},
        {"key": "partner_1_name", "type": "text", "required": true, "label": "Partner 1 Name"},
        {"key": "partner_1_ownership", "type": "number", "required": true, "label": "Partner 1 Ownership %"},
        {"key": "partner_2_name", "type": "text", "required": true, "label": "Partner 2 Name"},
        {"key": "partner_2_ownership", "type": "number", "required": true, "label": "Partner 2 Ownership %"}
    ]'::jsonb,
    NULL,
    'Initial version',
    false,
    'ffffffff-ffff-4fff-ffff-ffffffffffff'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version 2.0.0 for ADGM Partnership (current/active)
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000004',
    '2.0.0',
    '[
        {"key": "partnership_name", "type": "text", "required": true, "label": "Partnership Name"},
        {"key": "adgm_license", "type": "text", "required": true, "label": "ADGM License Number"},
        {"key": "partner_1_name", "type": "text", "required": true, "label": "Partner 1 Name"},
        {"key": "partner_1_ownership", "type": "number", "required": true, "label": "Partner 1 Ownership %"},
        {"key": "partner_2_name", "type": "text", "required": true, "label": "Partner 2 Name"},
        {"key": "partner_2_ownership", "type": "number", "required": true, "label": "Partner 2 Ownership %"},
        {"key": "capital_contribution", "type": "number", "required": true, "label": "Total Capital (AED)"},
        {"key": "profit_sharing_ratio", "type": "text", "required": true, "label": "Profit Sharing Ratio"}
    ]'::jsonb,
    NULL,
    'Added ADGM license field, capital contribution, and profit sharing provisions',
    true,
    'ffffffff-ffff-4fff-ffff-ffffffffffff'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

COMMIT;

-- =========================
-- Verification Queries
-- =========================

DO $$
DECLARE
    template_count INT;
    version_count INT;
BEGIN
    SELECT COUNT(*) INTO template_count FROM public.templates;
    SELECT COUNT(*) INTO version_count FROM public.template_versions;

    RAISE NOTICE '=========================';
    RAISE NOTICE 'Template Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE '✅ Templates seeded: %', template_count;
    RAISE NOTICE '✅ Template versions seeded: %', version_count;
    RAISE NOTICE '=========================';
END $$;

-- Display seeded templates
SELECT
    t.key,
    t.name,
    t.current_version,
    t.status,
    t.tier,
    c.name as category,
    a.code as authority
FROM public.templates t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.authorities a ON t.authority_id = a.id
ORDER BY t.created_at;
