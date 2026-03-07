-- =========================
-- Seed Script 005: Test Documents (Tenant-Specific)
-- =========================
-- Description: Seed sample documents for testing RLS tenant isolation
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- Dependencies: Requires tenants, users, and templates to be seeded first
-- WARNING: These are tenant-specific documents - perfect for testing RLS policies
-- =========================

BEGIN;

-- =========================
-- Documents for Tenant 1 (Pro Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000001'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    '10000000-0000-0000-0000-000000000001'::UUID,
    'John Smith - DMCC Employment Contract',
    'Limited employment contract for software engineer position at TechCorp DMCC',
    '{
        "status": "draft",
        "document_type": "employment_contract",
        "authority": "DMCC",
        "category": "employment"
    }'::jsonb,
    '{
        "employee_name": "John Smith",
        "employee_id": "EMP-2024-001",
        "position": "Senior Software Engineer",
        "department": "Engineering",
        "start_date": "2024-03-01",
        "end_date": "2026-02-28",
        "salary": 25000,
        "probation_period": 180
    }'::jsonb,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000002'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    '10000000-0000-0000-0000-000000000002'::UUID,
    'TechCorp - InnovateLabs NDA',
    'Mutual NDA for technology partnership discussions between TechCorp and InnovateLabs',
    '{
        "status": "signed",
        "document_type": "nda",
        "authority": "DIFC",
        "category": "nda",
        "signed_date": "2024-01-20",
        "file_url": "https://s3.complytude.test/documents/tenant1/nda_techcorp_innovate_signed.pdf"
    }'::jsonb,
    '{
        "party_a_name": "TechCorp DIFC Ltd",
        "party_a_license": "DIFC-2023-1234",
        "party_b_name": "InnovateLabs DIFC",
        "party_b_license": "DIFC-2023-5678",
        "effective_date": "2024-01-15",
        "disclosure_purpose": "Exploration of potential strategic technology partnership",
        "term_years": 2
    }'::jsonb,
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000002'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000003'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    '10000000-0000-0000-0000-000000000005'::UUID,
    'Office Lease - Downtown Dubai',
    'Commercial office space lease agreement for Building 5, IFZA Business Park',
    '{
        "status": "pending_review",
        "document_type": "lease",
        "authority": "IFZA",
        "category": "lease"
    }'::jsonb,
    '{
        "property_address": "Building 5, IFZA Business Park",
        "lease_term_months": 24,
        "monthly_rent": 45000,
        "security_deposit": 90000
    }'::jsonb,
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000005'
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Documents for Tenant 2 (Basic Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000004'::UUID,
    '22222222-2222-4222-8222-222222222222'::UUID,
    '10000000-0000-0000-0000-000000000003'::UUID,
    'Sarah Johnson - Freelance Design Services',
    'Freelance graphic design services agreement for brand identity project',
    '{
        "status": "signed",
        "document_type": "freelance",
        "authority": "DED",
        "category": "freelance",
        "signed_date": "2024-01-31",
        "file_url": "https://s3.complytude.test/documents/tenant2/freelance_sarah_johnson_signed.pdf"
    }'::jsonb,
    '{
        "contractor_name": "Sarah Johnson",
        "contractor_license": "FL-DED-2024-9876",
        "service_description": "Brand identity and marketing materials design",
        "contract_value": 15000,
        "payment_terms": "50% upfront, 50% on completion",
        "start_date": "2024-02-01",
        "end_date": "2024-05-31"
    }'::jsonb,
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000003'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000005'::UUID,
    '22222222-2222-4222-8222-222222222222'::UUID,
    '10000000-0000-0000-0000-000000000001'::UUID,
    'Ahmed Ali - DMCC Employment Contract',
    'Limited employment contract for marketing manager position',
    '{
        "status": "draft",
        "document_type": "employment_contract",
        "authority": "DMCC",
        "category": "employment"
    }'::jsonb,
    '{
        "employee_name": "Ahmed Ali",
        "employee_id": "EMP-2024-042",
        "position": "Marketing Manager",
        "department": "Marketing",
        "start_date": "2024-04-01",
        "end_date": "2025-03-31",
        "salary": 18000,
        "probation_period": 180
    }'::jsonb,
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000001'
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Documents for Tenant 3 (Enterprise Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000006'::UUID,
    '33333333-2222-4222-8222-333333333333'::UUID,
    '10000000-0000-0000-0000-000000000004'::UUID,
    'Enterprise Global - Mega Corp Partnership',
    'Strategic partnership agreement for joint ventures in ADGM',
    '{
        "status": "signed",
        "document_type": "partnership",
        "authority": "ADGM",
        "category": "partnership",
        "signed_date": "2024-01-10",
        "file_url": "https://s3.complytude.test/documents/tenant3/partnership_enterprise_megacorp_signed.pdf"
    }'::jsonb,
    '{
        "partnership_name": "Enterprise Global - Mega Corp JV",
        "adgm_license": "ADGM-2024-ENT-7890",
        "partner_1_name": "Enterprise Global ADGM Ltd",
        "partner_1_ownership": 60,
        "partner_2_name": "Mega Corp International",
        "partner_2_ownership": 40,
        "capital_contribution": 5000000,
        "profit_sharing_ratio": "60:40 as per ownership"
    }'::jsonb,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000004'
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, template_id, title, content, metadata, generation_metadata, created_by)
SELECT 
    '20000000-0000-0000-0000-000000000007'::UUID,
    '33333333-2222-4222-8222-333333333333'::UUID,
    '10000000-0000-0000-0000-000000000002'::UUID,
    'Confidential Project NDA - Project Phoenix',
    'High-security NDA for classified enterprise project development',
    '{
        "status": "signed",
        "document_type": "nda",
        "authority": "DIFC",
        "category": "nda",
        "security_level": "confidential",
        "signed_date": "2024-01-12",
        "file_url": "https://s3.complytude.test/documents/tenant3/nda_project_phoenix_signed.pdf"
    }'::jsonb,
    '{
        "party_a_name": "Enterprise Global ADGM Ltd",
        "party_a_license": "ADGM-2024-ENT-7890",
        "party_b_name": "Defense Tech Solutions DIFC",
        "party_b_license": "DIFC-2023-DEF-1111",
        "effective_date": "2024-01-10",
        "disclosure_purpose": "Development of advanced security systems for Project Phoenix",
        "term_years": 5
    }'::jsonb,
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
FROM public.templates
WHERE id = '10000000-0000-0000-0000-000000000002'
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =========================
-- Verification Queries
-- =========================

DO $$
DECLARE
    doc_tenant1 INT;
    doc_tenant2 INT;
    doc_tenant3 INT;
    total_docs INT;
BEGIN
    SELECT COUNT(*) INTO doc_tenant1 FROM public.documents WHERE tenant_id = '11111111-1111-4111-8111-111111111111';
    SELECT COUNT(*) INTO doc_tenant2 FROM public.documents WHERE tenant_id = '22222222-2222-4222-8222-222222222222';
    SELECT COUNT(*) INTO doc_tenant3 FROM public.documents WHERE tenant_id = '33333333-2222-4222-8222-333333333333';
    SELECT COUNT(*) INTO total_docs FROM public.documents;
    
    RAISE NOTICE '=========================';
    RAISE NOTICE 'Document Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE '✅ Total documents seeded: %', total_docs;
    RAISE NOTICE '  - Tenant 1 (Pro): % documents', doc_tenant1;
    RAISE NOTICE '  - Tenant 2 (Basic): % documents', doc_tenant2;
    RAISE NOTICE '  - Tenant 3 (Enterprise): % documents', doc_tenant3;
    RAISE NOTICE '=========================';
    RAISE NOTICE 'RLS Testing Notes:';
    RAISE NOTICE '  - Each tenant should only see their own documents';
    RAISE NOTICE '  - Cross-tenant queries should return zero results';
    RAISE NOTICE '  - Use set_config to test different tenant contexts';
    RAISE NOTICE '=========================';
END $$;

-- Display seeded documents grouped by tenant
SELECT 
    t.name as tenant_name,
    t.slug as tenant_slug,
    d.title as document_title,
    d.metadata->>'status' as status,
    u.email as created_by_email,
    d.created_at
FROM public.documents d
JOIN public.tenants t ON d.tenant_id = t.id
JOIN public.users u ON d.created_by = u.id
ORDER BY t.name, d.created_at;
