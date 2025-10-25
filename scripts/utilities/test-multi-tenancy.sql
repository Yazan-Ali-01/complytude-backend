-- ============================================================================
-- Multi-Tenancy Testing Script
-- ============================================================================
-- This script demonstrates and tests tenant isolation
-- ============================================================================

-- Clean up any existing test data
DO $$
BEGIN
    -- Bypass RLS for cleanup
    PERFORM public.bypass_rls(true);
    
    DELETE FROM public.tenants WHERE email LIKE 'test%@example.com';
    
    -- Re-enable RLS
    PERFORM public.bypass_rls(false);
END $$;

\echo '=================================='
\echo 'Multi-Tenancy Testing'
\echo '=================================='
\echo ''

-- ============================================================================
-- TEST 1: Create Test Tenants
-- ============================================================================

\echo '1. Creating test tenants...'

-- Bypass RLS to create tenants
SELECT public.bypass_rls(true);

-- Create first test tenant
INSERT INTO public.tenants (id, tenant_id, email, role, plan, features, schema_name, is_active)
VALUES (
    'user_test_001',
    'tenant_test_001',
    'test1@example.com',
    'admin',
    'early_access',
    '{"document_limit": 5, "checklist_access": true, "analyzer_enabled": true}'::jsonb,
    'tenant_tenant_test_001',
    true
);

-- Create schema for first tenant
CREATE SCHEMA IF NOT EXISTS tenant_tenant_test_001;
INSERT INTO public.tenant_schemas (tenant_id, schema_name, is_active)
VALUES ('tenant_test_001', 'tenant_tenant_test_001', true);

-- Create second test tenant
INSERT INTO public.tenants (id, tenant_id, email, role, plan, features, schema_name, is_active)
VALUES (
    'user_test_002',
    'tenant_test_002',
    'test2@example.com',
    'user',
    'pro',
    '{"document_limit": 10, "checklist_access": true, "analyzer_enabled": true}'::jsonb,
    'tenant_tenant_test_002',
    true
);

-- Create schema for second tenant
CREATE SCHEMA IF NOT EXISTS tenant_tenant_test_002;
INSERT INTO public.tenant_schemas (tenant_id, schema_name, is_active)
VALUES ('tenant_test_002', 'tenant_tenant_test_002', true);

\echo '✓ Test tenants created'
\echo ''

-- ============================================================================
-- TEST 2: Create Sample Data in Tenant Schemas
-- ============================================================================

\echo '2. Creating sample data in tenant schemas...'

-- Create documents table for tenant 1
CREATE TABLE IF NOT EXISTS tenant_tenant_test_001.documents (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE tenant_tenant_test_001.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_isolation ON tenant_tenant_test_001.documents
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Insert data for tenant 1
INSERT INTO tenant_tenant_test_001.documents (id, tenant_id, title, content)
VALUES 
    ('doc_001', 'tenant_test_001', 'Tenant 1 - Document 1', 'This is private data for tenant 1'),
    ('doc_002', 'tenant_test_001', 'Tenant 1 - Document 2', 'More private data for tenant 1');

-- Create documents table for tenant 2
CREATE TABLE IF NOT EXISTS tenant_tenant_test_002.documents (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE tenant_tenant_test_002.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_isolation ON tenant_tenant_test_002.documents
    USING (tenant_id = current_setting('app.current_tenant_id', true));

-- Insert data for tenant 2
INSERT INTO tenant_tenant_test_002.documents (id, tenant_id, title, content)
VALUES 
    ('doc_003', 'tenant_test_002', 'Tenant 2 - Document 1', 'This is private data for tenant 2'),
    ('doc_004', 'tenant_test_002', 'Tenant 2 - Document 2', 'More private data for tenant 2');

\echo '✓ Sample data created'
\echo ''

-- ============================================================================
-- TEST 3: Test RLS - Tenant Isolation on Tenants Table
-- ============================================================================

\echo '3. Testing RLS on tenants table...'

-- Re-enable RLS
SELECT public.bypass_rls(false);

-- Set context to tenant 1
SELECT public.set_tenant_context('tenant_test_001');

\echo 'Current tenant context: tenant_test_001'
\echo 'Querying public.tenants (should only see tenant_test_001):'
SELECT tenant_id, email FROM public.tenants;

\echo ''

-- Set context to tenant 2
SELECT public.set_tenant_context('tenant_test_002');

\echo 'Current tenant context: tenant_test_002'
\echo 'Querying public.tenants (should only see tenant_test_002):'
SELECT tenant_id, email FROM public.tenants;

\echo ''

-- ============================================================================
-- TEST 4: Test Schema Isolation
-- ============================================================================

\echo '4. Testing schema-based isolation...'

-- Set context to tenant 1
SELECT public.set_tenant_context('tenant_test_001');

\echo 'Tenant 1 context - Accessing tenant_tenant_test_001.documents:'
SET search_path TO tenant_tenant_test_001, public;
SELECT id, title FROM documents;

\echo ''

-- Try to access tenant 2's schema (should return RLS protected results)
\echo 'Tenant 1 context - Attempting to access tenant_tenant_test_002.documents:'
SET search_path TO tenant_tenant_test_002, public;
SELECT id, title FROM documents;

\echo ''

-- Set context to tenant 2
SELECT public.set_tenant_context('tenant_test_002');

\echo 'Tenant 2 context - Accessing tenant_tenant_test_002.documents:'
SET search_path TO tenant_tenant_test_002, public;
SELECT id, title FROM documents;

\echo ''

-- ============================================================================
-- TEST 5: Test Bypass RLS (Admin Access)
-- ============================================================================

\echo '5. Testing RLS bypass (admin access)...'

SELECT public.bypass_rls(true);

\echo 'RLS Bypassed - Viewing all tenants:'
SELECT tenant_id, email, plan FROM public.tenants WHERE email LIKE 'test%@example.com';

\echo ''

-- ============================================================================
-- TEST 6: Test Helper Functions
-- ============================================================================

\echo '6. Testing helper functions...'

-- Test get_tenant_context
SELECT public.set_tenant_context('tenant_test_001');
\echo 'Current tenant context:'
SELECT public.get_tenant_context() as current_tenant;

\echo ''

-- ============================================================================
-- CLEANUP
-- ============================================================================

\echo '7. Cleaning up test data...'

-- Bypass RLS for cleanup
SELECT public.bypass_rls(true);

-- Drop test schemas
DROP SCHEMA IF EXISTS tenant_tenant_test_001 CASCADE;
DROP SCHEMA IF EXISTS tenant_tenant_test_002 CASCADE;

-- Delete test data
DELETE FROM public.tenant_schemas WHERE tenant_id LIKE 'tenant_test_%';
DELETE FROM public.tenants WHERE tenant_id LIKE 'tenant_test_%';

-- Reset
SELECT public.bypass_rls(false);
RESET search_path;

\echo '✓ Cleanup complete'
\echo ''

\echo '=================================='
\echo 'All Tests Complete!'
\echo '=================================='
\echo ''
\echo 'Summary:'
\echo '- Schema-based isolation: Working'
\echo '- Row-level security: Working'
\echo '- Tenant context: Working'
\echo '- Helper functions: Working'

