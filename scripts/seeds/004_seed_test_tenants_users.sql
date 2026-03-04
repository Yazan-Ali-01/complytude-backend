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

INSERT INTO public.tenants (
    id, is_active, name, slug, logo_url, settings, onboarding_metadata,
    brand_color_primary, brand_color_secondary, contact_email, billing_email,
    contact_phone, emirate, city, address_line_1, address_line_2, postal_code,
    trade_license_number, legal_entity_type, tax_registration_number, locale,
    timezone, default_jurisdiction, parent_tenant_id, onboarding_completed_at,
    deactivated_at, deactivation_reason
) VALUES
    (
        '11111111-1111-4111-8111-111111111111', true, 'Acme Legal LLC', 'acme-legal', NULL,
        '{"notifications": true, "theme": "light"}', '{"step": 1, "completed": false}',
        '#0000FF', '#FFFFFF', 'contact@acme-legal.com', 'billing@acme-legal.com',
        '+1234567890', 'Dubai', 'Dubai', 'PO Box 1234', NULL, '12345',
        'TL123456789', 'LLC', 'TRN123456789', 'en', 'Asia/Dubai', 'Dubai', NULL, NULL,
        NULL, NULL
    ),
    (
        '22222222-2222-4222-8222-222222222222', true, 'Shield Corp', 'shield-corp', NULL,
        '{"notifications": true, "theme": "dark"}', '{"step": 2, "completed": false}',
        '#FF0000', '#000000', 'contact@shield-corp.com', 'billing@shield-corp.com',
        '+0987654321', 'Abu Dhabi', 'Abu Dhabi', 'PO Box 5678', NULL, '54321',
        'TL987654321', 'Corporation', 'TRN987654321', 'en', 'Asia/Dubai', 'Abu Dhabi', NULL, NULL,
        NULL, NULL
    ),
    (
        '33333333-2222-4222-8222-333333333333', true, 'Infrastructure Inc', 'infra-inc', NULL,
        '{"notifications": false, "theme": "light"}', '{"step": 3, "completed": false}',
        '#00FF00', '#FFFF00', 'contact@infra-inc.com', 'billing@infra-inc.com',
        '+1122334455', 'Sharjah', 'Sharjah', 'PO Box 91011', NULL, '67890',
        'TL112233445', 'Partnership', 'TRN112233445', 'en', 'Asia/Dubai', 'Sharjah', NULL, NULL,
        NULL, NULL
    )
ON CONFLICT (id) DO UPDATE SET
    is_active = EXCLUDED.is_active,
    name = COALESCE(EXCLUDED.name, tenants.name),
    slug = COALESCE(EXCLUDED.slug, tenants.slug),
    logo_url = NULL,
    settings = COALESCE(EXCLUDED.settings, tenants.settings),
    onboarding_metadata = COALESCE(EXCLUDED.onboarding_metadata, tenants.onboarding_metadata),
    brand_color_primary = COALESCE(EXCLUDED.brand_color_primary, tenants.brand_color_primary),
    brand_color_secondary = COALESCE(EXCLUDED.brand_color_secondary, tenants.brand_color_secondary),
    contact_email = COALESCE(EXCLUDED.contact_email, tenants.contact_email),
    billing_email = COALESCE(EXCLUDED.billing_email, tenants.billing_email),
    contact_phone = COALESCE(EXCLUDED.contact_phone, tenants.contact_phone),
    emirate = COALESCE(EXCLUDED.emirate, tenants.emirate),
    city = COALESCE(EXCLUDED.city, tenants.city),
    address_line_1 = COALESCE(EXCLUDED.address_line_1, tenants.address_line_1),
    address_line_2 = COALESCE(EXCLUDED.address_line_2, tenants.address_line_2),
    postal_code = COALESCE(EXCLUDED.postal_code, tenants.postal_code),
    trade_license_number = COALESCE(EXCLUDED.trade_license_number, tenants.trade_license_number),
    legal_entity_type = COALESCE(EXCLUDED.legal_entity_type, tenants.legal_entity_type),
    tax_registration_number = COALESCE(EXCLUDED.tax_registration_number, tenants.tax_registration_number),
    locale = COALESCE(EXCLUDED.locale, tenants.locale),
    timezone = COALESCE(EXCLUDED.timezone, tenants.timezone),
    default_jurisdiction = COALESCE(EXCLUDED.default_jurisdiction, tenants.default_jurisdiction),
    parent_tenant_id = COALESCE(EXCLUDED.parent_tenant_id, tenants.parent_tenant_id),
    onboarding_completed_at = COALESCE(EXCLUDED.onboarding_completed_at, tenants.onboarding_completed_at),
    deactivated_at = COALESCE(EXCLUDED.deactivated_at, tenants.deactivated_at),
    deactivation_reason = COALESCE(EXCLUDED.deactivation_reason, tenants.deactivation_reason);

-- =========================
-- Test Users
-- =========================
-- Password for all test users: "Test123!@#"
-- Hash generated with bcrypt (10 rounds): $2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW

INSERT INTO public.users (
    id, email, password_hash, first_name, last_name, is_verified, platform_role_key,
    created_at, updated_at
) VALUES
    (
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'admin@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Alice', 'Admin', true, NULL, now(), now()
    ),
    (
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'member@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Bob', 'Member', true, NULL, now(), now()
    ),
    (
        'cccccccc-cccc-cccc-cccc-cccccccccccc', 'viewer@tenant1.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Charlie', 'Viewer', true, NULL, now(), now()
    ),
    (
        'dddddddd-dddd-dddd-dddd-dddddddddddd', 'admin@tenant2.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Diana', 'Admin', true, NULL, now(), now()
    ),
    (
        'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'member@tenant2.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Eve', 'Member', true, NULL, now(), now()
    ),
    (
        'ffffffff-ffff-ffff-ffff-ffffffffffff', 'admin@tenant3.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'Frank', 'Enterprise', true, NULL, now(), now()
    ),
    (
        '99999999-9999-9999-9999-999999999999', 'superadmin@complytude.test', '$2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW',
        'System', 'Administrator', true, 'system_admin', now(), now()
    )
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

-- -- =========================
-- -- Mock Storage Tracking Table (For Test Verification)
-- -- =========================

-- CREATE TABLE IF NOT EXISTS public.mock_storage_uploads (
--     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--     tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
--     file_key TEXT NOT NULL,
--     file_url TEXT NOT NULL,
--     mimetype TEXT NOT NULL,
--     original_name TEXT NOT NULL,
--     size_bytes INT NOT NULL,
--     user_id UUID NOT NULL REFERENCES public.users(id),
--     created_at TIMESTAMPTZ DEFAULT NOW()
-- );

-- CREATE INDEX IF NOT EXISTS idx_mock_storage_tenant ON public.mock_storage_uploads(tenant_id);
-- CREATE INDEX IF NOT EXISTS idx_mock_storage_created ON public.mock_storage_uploads(created_at);

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
