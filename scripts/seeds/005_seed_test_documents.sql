-- =========================
-- Seed Script 005: Test Documents (Tenant-Specific)
-- =========================
-- Description: Seed sample documents for testing RLS tenant isolation
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- Dependencies: Requires tenants and users to be seeded first
-- WARNING: These are tenant-specific documents - perfect for testing RLS policies
-- =========================

BEGIN;

-- =========================
-- Documents for Tenant 1 (Pro Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000001'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    'John Smith - DMCC Employment Contract',
    'Limited employment contract for software engineer position at TechCorp DMCC',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000002'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    'TechCorp - InnovateLabs NDA',
    'Mutual NDA for technology partnership discussions between TechCorp and InnovateLabs',
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::UUID
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000003'::UUID,
    '11111111-1111-4111-8111-111111111111'::UUID,
    'Office Lease - Downtown Dubai',
    'Commercial office space lease agreement for Building 5, IFZA Business Park',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::UUID
)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Documents for Tenant 2 (Basic Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000004'::UUID,
    '22222222-2222-4222-8222-222222222222'::UUID,
    'Sarah Johnson - Freelance Design Services',
    'Freelance graphic design services agreement for brand identity project',
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000005'::UUID,
    '22222222-2222-4222-8222-222222222222'::UUID,
    'Ahmed Ali - DMCC Employment Contract',
    'Limited employment contract for marketing manager position',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::UUID
)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Documents for Tenant 3 (Enterprise Plan)
-- =========================

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000006'::UUID,
    '33333333-2222-4222-8222-333333333333'::UUID,
    'Enterprise Global - Mega Corp Partnership',
    'Strategic partnership agreement for joint ventures in ADGM',
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, tenant_id, title, content, created_by)
VALUES (
    '20000000-0000-0000-0000-000000000007'::UUID,
    '33333333-2222-4222-8222-333333333333'::UUID,
    'Confidential Project NDA - Project Phoenix',
    'High-security NDA for classified enterprise project development',
    'ffffffff-ffff-ffff-ffff-ffffffffffff'::UUID
)
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

SELECT
    t.name as tenant_name,
    t.slug as tenant_slug,
    d.title as document_title,
    u.email as created_by_email,
    d.created_at
FROM public.documents d
JOIN public.tenants t ON d.tenant_id = t.id
JOIN public.users u ON d.created_by = u.id
ORDER BY t.name, d.created_at;
