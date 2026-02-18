-- =========================
-- Seed Script 004: Test Tenants and Users (With Logo Testing Support)
-- =========================
-- Description: Seed test tenants, users, and user-tenant relationships for development/testing
-- Idempotent: Uses ON CONFLICT DO NOTHING / UPDATE
-- WARNING: Contains test passwords - DO NOT use in production
-- =========================

BEGIN;

-- =========================
-- Test Tenants
-- =========================
-- NOTE: logo_url is NULL for clean upload testing

INSERT INTO public.tenants (id, plan, is_active, name, slug, logo_url, settings, onboarding_metadata) VALUES
    ('11111111-1111-4111-8111-111111111111', 'general_counsel', true, 'Acme Legal LLC', 'acme-legal', NULL, '{"notifications": true, "theme": "light"}', '{"step": 1, "completed": false}'),
    ('22222222-2222-4222-8222-222222222222', 'shield', true, 'Shield Corp', 'shield-corp', NULL, '{"notifications": true, "theme": "dark"}', '{"step": 2, "completed": false}'),
    ('33333333-2222-4222-8222-333333333333', 'infrastructure', true, 'Infrastructure Inc', 'infra-inc', NULL, '{"notifications": false, "theme": "light"}', '{"step": 3, "completed": false}')
ON CONFLICT (id) DO UPDATE SET
    plan = EXCLUDED.plan,
    is_active = EXCLUDED.is_active,
    name = COALESCE(EXCLUDED.name, tenants.name),
    slug = COALESCE(EXCLUDED.slug, tenants.slug),
    logo_url = NULL,
    settings = COALESCE(EXCLUDED.settings, tenants.settings),
    onboarding_metadata = COALESCE(EXCLUDED.onboarding_metadata, tenants.onboarding_metadata);

-- =========================
-- Test Users
-- =========================
-- Password for all test users: "Test123!@#"
-- Hash generated with bcrypt (10 rounds): $2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW

INSERT INTO public.users (id, email, password_hash, first_name, last_name, is_verified, platform_role_key) VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Alice', 'Admin', true, NULL),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Bob', 'Member', true, NULL),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'viewer@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Charlie', 'Viewer', true, NULL),
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@tenant2.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Diana', 'Admin', true, NULL),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member@tenant2.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Eve', 'Member', true, NULL),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'admin@tenant3.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'Frank', 'Enterprise', true, NULL),
    ('99999999-9999-9999-9999-999999999999', 'superadmin@complytude.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW', 'System', 'Administrator', true, 'system_admin')
ON CONFLICT (id) DO NOTHING;

-- =========================
-- User-Tenant Relationships
-- =========================
-- System roles: tenant_admin, legal_counsel, member, viewer

INSERT INTO public.user_tenants (user_id, tenant_id, role_key) VALUES
    -- Tenant 1 (general_counsel plan) - 3 users
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'tenant_admin'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'member'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer'),

    -- Tenant 2 (shield plan) - 2 users
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 'tenant_admin'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'member'),

    -- Tenant 3 (infrastructure plan) - 1 user
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-2222-4222-8222-333333333333', 'tenant_admin'),

    -- Multi-tenant user: Bob is also a viewer in Tenant 2
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer')
ON CONFLICT (user_id, tenant_id) DO UPDATE SET
    role_key = EXCLUDED.role_key;

-- =========================
-- Refresh Tokens (for auth testing)
-- =========================

INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at) VALUES
    (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '$2b$10$token1hash1hash1hash1hash1hash1hash1hash1hash1hash1hash1h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '$2b$10$token2hash2hash2hash2hash2hash2hash2hash2hash2hash2hash2h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-cccccccccccc', '$2b$10$token3hash3hash3hash3hash3hash3hash3hash3hash3hash3hash3h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'dddddddd-dddd-dddd-dddd-dddddddddddd', '$2b$10$token4hash4hash4hash4hash4hash4hash4hash4hash4hash4hash4h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '$2b$10$token5hash5hash5hash5hash5hash5hash5hash5hash5hash5hash5h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'ffffffff-ffff-ffff-ffff-ffffffffffff', '$2b$10$token6hash6hash6hash6hash6hash6hash6hash6hash6hash6hash6h', now() + interval '7 days', NULL)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Mock Storage Tracking Table (For Test Verification)
-- =========================

CREATE TABLE IF NOT EXISTS public.mock_storage_uploads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    file_key TEXT NOT NULL,
    file_url TEXT NOT NULL,
    mimetype TEXT NOT NULL,
    original_name TEXT NOT NULL,
    size_bytes INT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mock_storage_tenant ON public.mock_storage_uploads(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mock_storage_created ON public.mock_storage_uploads(created_at);

COMMIT;

-- =========================
-- Verification Queries
-- =========================

DO $$
DECLARE
    tenant_count INT;
    user_count INT;
    relationship_count INT;
    null_logo_count INT;
BEGIN
    SELECT COUNT(*) INTO tenant_count FROM public.tenants;
    SELECT COUNT(*) INTO user_count FROM public.users;
    SELECT COUNT(*) INTO relationship_count FROM public.user_tenants;
    SELECT COUNT(*) INTO null_logo_count FROM public.tenants WHERE logo_url IS NULL;

    RAISE NOTICE '=========================';
    RAISE NOTICE 'Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE '✅ Tenants seeded: %', tenant_count;
    RAISE NOTICE '✅ Users seeded: %', user_count;
    RAISE NOTICE '✅ User-tenant relationships: %', relationship_count;
    RAISE NOTICE '✅ Tenants with NULL logo_url: %', null_logo_count;
    RAISE NOTICE '=========================';
    RAISE NOTICE 'Test Credentials (Password: Test123!@#):';
    RAISE NOTICE '  admin@tenant1.test (Tenant 1 - general_counsel)';
    RAISE NOTICE '  admin@tenant2.test (Tenant 2 - shield)';
    RAISE NOTICE '  admin@tenant3.test (Tenant 3 - infrastructure)';
    RAISE NOTICE '  superadmin@complytude.test (System Admin)';
    RAISE NOTICE '=========================';
END $$;
