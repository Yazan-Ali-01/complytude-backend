-- =========================
-- Seed Script 003: Test Tenants and Users
-- =========================
-- Description: Seed test tenants, users, and user-tenant relationships for development/testing
-- Idempotent: Uses ON CONFLICT DO NOTHING
-- WARNING: Contains test passwords - DO NOT use in production
-- =========================

BEGIN;

-- =========================
-- Test Tenants
-- =========================

INSERT INTO public.tenants (id, plan, is_active) VALUES
    ('11111111-1111-4111-8111-111111111111', 'general_counsel', true),
    ('22222222-2222-4222-8222-222222222222', 'shield', true),
    ('33333333-2222-4222-8222-333333333333', 'infrastructure', true)
ON CONFLICT (id) DO NOTHING;

-- =========================
-- Test Users
-- =========================
-- Password for all test users: "Test123!@#"
-- Hash generated with bcrypt (10 rounds): $2b$10$y8/jPXlBV3c6gPcO5.S6r.0QhUKTnaZ6NqbpM8flBwJ9ba4PpoziW
-- Note: Replace with actual bcrypt hash if needed

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
-- Note: Directly assigns role keys (no lookup needed)
-- System roles: tenant_admin, legal_counsel, member, viewer
-- Custom roles can be added per tenant as needed

INSERT INTO public.user_tenants (user_id, tenant_id, role_key) VALUES
    -- Tenant 1 (Pro plan) - 3 users
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'tenant_admin'),
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'member'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'viewer'),
    
    -- Tenant 2 (Basic plan) - 2 users
    ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 'tenant_admin'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '22222222-2222-4222-8222-222222222222', 'member'),
    
    -- Tenant 3 (Enterprise plan) - 1 user
    ('ffffffff-ffff-ffff-ffff-ffffffffffff', '33333333-2222-4222-8222-333333333333', 'tenant_admin'),
    
    -- Multi-tenant user: Bob is also a viewer in Tenant 2
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'viewer')
ON CONFLICT (user_id, tenant_id) DO NOTHING;

-- =========================
-- Refresh Tokens (for auth testing)
-- =========================
-- Note: revoked_at is NULL for active tokens, set to timestamp when revoked

INSERT INTO public.refresh_tokens (id, user_id, token_hash, expires_at, revoked_at) VALUES
    (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '$2b$10$token1hash1hash1hash1hash1hash1hash1hash1hash1hash1hash1h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '$2b$10$token2hash2hash2hash2hash2hash2hash2hash2hash2hash2hash2h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'cccccccc-cccc-cccc-cccc-cccccccccccc', '$2b$10$token3hash3hash3hash3hash3hash3hash3hash3hash3hash3hash3h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'dddddddd-dddd-dddd-dddd-dddddddddddd', '$2b$10$token4hash4hash4hash4hash4hash4hash4hash4hash4hash4hash4h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', '$2b$10$token5hash5hash5hash5hash5hash5hash5hash5hash5hash5hash5h', now() + interval '7 days', NULL),
    (gen_random_uuid(), 'ffffffff-ffff-ffff-ffff-ffffffffffff', '$2b$10$token6hash6hash6hash6hash6hash6hash6hash6hash6hash6hash6h', now() + interval '7 days', NULL)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- =========================
-- Verification Queries
-- =========================
-- Run these to verify the seed data:

DO $$
DECLARE
    tenant_count INT;
    user_count INT;
    relationship_count INT;
    token_count INT;
BEGIN
    SELECT COUNT(*) INTO tenant_count FROM public.tenants;
    SELECT COUNT(*) INTO user_count FROM public.users;
    SELECT COUNT(*) INTO relationship_count FROM public.user_tenants;
    SELECT COUNT(*) INTO token_count FROM public.refresh_tokens WHERE revoked_at IS NULL;
    
    RAISE NOTICE '=========================';
    RAISE NOTICE 'Seed Summary:';
    RAISE NOTICE '=========================';
    RAISE NOTICE '✅ Tenants seeded: %', tenant_count;
    RAISE NOTICE '✅ Users seeded: %', user_count;
    RAISE NOTICE '✅ User-tenant relationships: %', relationship_count;
    RAISE NOTICE '✅ Active refresh tokens: %', token_count;
    RAISE NOTICE '=========================';
    RAISE NOTICE 'Test Credentials:';
    RAISE NOTICE '  Email: admin@tenant1.test';
    RAISE NOTICE '  Password: Test123!@#';
    RAISE NOTICE '=========================';
END $$;

-- Optional: Display seeded data
-- SELECT 'TENANTS' as table_name, id, plan, is_active FROM public.tenants
-- UNION ALL
-- SELECT 'USERS', id::text, email, is_verified::text FROM public.users
-- ORDER BY table_name, id;
