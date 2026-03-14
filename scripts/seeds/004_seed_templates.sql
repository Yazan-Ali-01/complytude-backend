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

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by) 
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
    'https://s3.complytude.test/templates/dmcc_employment_limited_v1.docx',
    'https://s3.complytude.test/thumbnails/dmcc_employment_limited_v1.png',
    '{"pages": 5, "fields_count": 18, "compliance_version": "2024.1", "last_audit": "2024-12-01"}',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'employment' AND a.code = 'DMCC'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by)
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
    'https://s3.complytude.test/templates/difc_nda_mutual_v1.docx',
    'https://s3.complytude.test/thumbnails/difc_nda_mutual_v1.png',
    '{"pages": 3, "fields_count": 12, "compliance_version": "2024.1"}',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'nda' AND a.code = 'DIFC'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by)
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
    'https://s3.complytude.test/templates/ded_freelance_v1.docx',
    'https://s3.complytude.test/thumbnails/ded_freelance_v1.png',
    '{"pages": 4, "fields_count": 15, "compliance_version": "2024.1"}',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'freelance' AND a.code = 'DED'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by)
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
    'https://s3.complytude.test/templates/adgm_partnership_v2.docx',
    'https://s3.complytude.test/thumbnails/adgm_partnership_v2.png',
    '{"pages": 8, "fields_count": 25, "compliance_version": "2024.2"}',
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
FROM public.categories c
CROSS JOIN public.authorities a
WHERE c.code = 'partnership' AND a.code = 'ADGM'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.templates (id, key, name, description, category_id, authority_id, languages, current_version, status, file_url, thumbnail_url, metadata, created_by)
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
    'https://s3.complytude.test/templates/ifza_lease_v1.docx',
    'https://s3.complytude.test/thumbnails/ifza_lease_v1.png',
    '{"pages": 6, "fields_count": 20, "compliance_version": "2024.1"}',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
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
        {"name": "employee_name", "type": "text", "required": true, "label": "Employee Full Name"},
        {"name": "employee_id", "type": "text", "required": true, "label": "Employee ID"},
        {"name": "position", "type": "text", "required": true, "label": "Job Position"},
        {"name": "department", "type": "text", "required": false, "label": "Department"},
        {"name": "start_date", "type": "date", "required": true, "label": "Contract Start Date"},
        {"name": "end_date", "type": "date", "required": true, "label": "Contract End Date"},
        {"name": "salary", "type": "number", "required": true, "label": "Monthly Salary (AED)"},
        {"name": "probation_period", "type": "number", "required": false, "label": "Probation Period (days)", "default": 180}
    ]'::jsonb,
    'https://s3.complytude.test/templates/dmcc_employment_limited_v1.docx',
    'Initial version - DMCC compliance requirements',
    true,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version for DIFC NDA
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000002',
    '1.0.0',
    '[
        {"name": "party_a_name", "type": "text", "required": true, "label": "Party A Company Name"},
        {"name": "party_a_license", "type": "text", "required": true, "label": "Party A License Number"},
        {"name": "party_b_name", "type": "text", "required": true, "label": "Party B Company Name"},
        {"name": "party_b_license", "type": "text", "required": true, "label": "Party B License Number"},
        {"name": "effective_date", "type": "date", "required": true, "label": "Effective Date"},
        {"name": "disclosure_purpose", "type": "textarea", "required": true, "label": "Purpose of Disclosure"},
        {"name": "term_years", "type": "number", "required": true, "label": "Term (Years)", "default": 2}
    ]'::jsonb,
    'https://s3.complytude.test/templates/difc_nda_mutual_v1.docx',
    'Initial version - DIFC common law provisions',
    true,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version 1.0.0 for ADGM Partnership
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000004',
    '1.0.0',
    '[
        {"name": "partnership_name", "type": "text", "required": true, "label": "Partnership Name"},
        {"name": "partner_1_name", "type": "text", "required": true, "label": "Partner 1 Name"},
        {"name": "partner_1_ownership", "type": "number", "required": true, "label": "Partner 1 Ownership %"},
        {"name": "partner_2_name", "type": "text", "required": true, "label": "Partner 2 Name"},
        {"name": "partner_2_ownership", "type": "number", "required": true, "label": "Partner 2 Ownership %"}
    ]'::jsonb,
    'https://s3.complytude.test/templates/adgm_partnership_v1.docx',
    'Initial version',
    false,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'
) ON CONFLICT ON CONSTRAINT uq_template_versions_template_version DO NOTHING;

-- Version 2.0.0 for ADGM Partnership (current/active)
INSERT INTO public.template_versions (id, template_id, version, fields, file_url, changelog, is_active, created_by)
VALUES (
    gen_random_uuid(),
    '10000000-0000-0000-0000-000000000004',
    '2.0.0',
    '[
        {"name": "partnership_name", "type": "text", "required": true, "label": "Partnership Name"},
        {"name": "adgm_license", "type": "text", "required": true, "label": "ADGM License Number"},
        {"name": "partner_1_name", "type": "text", "required": true, "label": "Partner 1 Name"},
        {"name": "partner_1_ownership", "type": "number", "required": true, "label": "Partner 1 Ownership %"},
        {"name": "partner_2_name", "type": "text", "required": true, "label": "Partner 2 Name"},
        {"name": "partner_2_ownership", "type": "number", "required": true, "label": "Partner 2 Ownership %"},
        {"name": "capital_contribution", "type": "number", "required": true, "label": "Total Capital (AED)"},
        {"name": "profit_sharing_ratio", "type": "text", "required": true, "label": "Profit Sharing Ratio"}
    ]'::jsonb,
    'https://s3.complytude.test/templates/adgm_partnership_v2.docx',
    'Added ADGM license field, capital contribution, and profit sharing provisions',
    true,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'
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
    c.name as category,
    a.code as authority
FROM public.templates t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.authorities a ON t.authority_id = a.id
ORDER BY t.created_at;
