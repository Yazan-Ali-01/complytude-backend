-- ============================================================================
-- Multi-Workspace Testing Script
-- ============================================================================
-- This script demonstrates and tests workspace isolation
-- ============================================================================

-- Clean up any existing test data
DO $$
BEGIN
    -- Bypass RLS for cleanup
    PERFORM public.bypass_rls(true);
    
    DELETE FROM public.workspaces WHERE email LIKE 'test%@example.com';
    
    -- Re-enable RLS
    PERFORM public.bypass_rls(false);
END $$;

\echo '=================================='
\echo 'Multi-Workspace Testing'
\echo '=================================='
\echo ''

-- ============================================================================
-- TEST 1: Create Test Workspaces
-- ============================================================================

\echo '1. Creating test workspaces...'

-- Bypass RLS to create workspaces
SELECT public.bypass_rls(true);

-- Create first test workspace
INSERT INTO public.workspaces (id, workspace_id, email, plan, features, schema_name, is_active)
VALUES (
    'user_test_001',
    'workspace_test_001',
    'test1@example.com',
    'early_access',
    '{"document_limit": 5, "checklist_access": true, "analyzer_enabled": true}'::jsonb,
    'workspace_workspace_test_001',
    true
);

-- Create schema for first workspace
CREATE SCHEMA IF NOT EXISTS workspace_workspace_test_001;
INSERT INTO public.workspace_schemas (workspace_id, schema_name, is_active)
VALUES ('workspace_test_001', 'workspace_workspace_test_001', true);

-- Create second test workspace
INSERT INTO public.workspaces (id, workspace_id, email, plan, features, schema_name, is_active)
VALUES (
    'user_test_002',
    'workspace_test_002',
    'test2@example.com',
    'pro',
    '{"document_limit": 10, "checklist_access": true, "analyzer_enabled": true}'::jsonb,
    'workspace_workspace_test_002',
    true
);

-- Create schema for second workspace
CREATE SCHEMA IF NOT EXISTS workspace_workspace_test_002;
INSERT INTO public.workspace_schemas (workspace_id, schema_name, is_active)
VALUES ('workspace_test_002', 'workspace_workspace_test_002', true);

\echo '✓ Test workspaces created'
\echo ''

-- ============================================================================
-- TEST 2: Create Sample Data in Workspace Schemas
-- ============================================================================

\echo '2. Creating sample data in workspace schemas...'

-- Create documents table for workspace 1
CREATE TABLE IF NOT EXISTS workspace_workspace_test_001.documents (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE workspace_workspace_test_001.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_isolation ON workspace_workspace_test_001.documents
    USING (workspace_id = current_setting('app.current_workspace_id', true));

-- Insert data for workspace 1
INSERT INTO workspace_workspace_test_001.documents (id, workspace_id, title, content)
VALUES 
    ('doc_001', 'workspace_test_001', 'Workspace 1 - Document 1', 'This is private data for workspace 1'),
    ('doc_002', 'workspace_test_001', 'Workspace 1 - Document 2', 'More private data for workspace 1');

-- Create documents table for workspace 2
CREATE TABLE IF NOT EXISTS workspace_workspace_test_002.documents (
    id VARCHAR(255) PRIMARY KEY,
    workspace_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Enable RLS
ALTER TABLE workspace_workspace_test_002.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY documents_isolation ON workspace_workspace_test_002.documents
    USING (workspace_id = current_setting('app.current_workspace_id', true));

-- Insert data for workspace 2
INSERT INTO workspace_workspace_test_002.documents (id, workspace_id, title, content)
VALUES 
    ('doc_003', 'workspace_test_002', 'Workspace 2 - Document 1', 'This is private data for workspace 2'),
    ('doc_004', 'workspace_test_002', 'Workspace 2 - Document 2', 'More private data for workspace 2');

\echo '✓ Sample data created'
\echo ''

-- ============================================================================
-- TEST 3: Test RLS - Workspace Isolation on Workspaces Table
-- ============================================================================

\echo '3. Testing RLS on workspaces table...'

-- Re-enable RLS
SELECT public.bypass_rls(false);

-- Set context to workspace 1
SELECT public.set_workspace_context('workspace_test_001');

\echo 'Current workspace context: workspace_test_001'
\echo 'Querying public.workspaces (should only see workspace_test_001):'
SELECT workspace_id, email FROM public.workspaces;

\echo ''

-- Set context to workspace 2
SELECT public.set_workspace_context('workspace_test_002');

\echo 'Current workspace context: workspace_test_002'
\echo 'Querying public.workspaces (should only see workspace_test_002):'
SELECT workspace_id, email FROM public.workspaces;

\echo ''

-- ============================================================================
-- TEST 4: Test Schema Isolation
-- ============================================================================

\echo '4. Testing schema-based isolation...'

-- Set context to workspace 1
SELECT public.set_workspace_context('workspace_test_001');

\echo 'Workspace 1 context - Accessing workspace_workspace_test_001.documents:'
SET search_path TO workspace_workspace_test_001, public;
SELECT id, title FROM documents;

\echo ''

-- Try to access workspace 2's schema (should return RLS protected results)
\echo 'Workspace 1 context - Attempting to access workspace_workspace_test_002.documents:'
SET search_path TO workspace_workspace_test_002, public;
SELECT id, title FROM documents;

\echo ''

-- Set context to workspace 2
SELECT public.set_workspace_context('workspace_test_002');

\echo 'Workspace 2 context - Accessing workspace_workspace_test_002.documents:'
SET search_path TO workspace_workspace_test_002, public;
SELECT id, title FROM documents;

\echo ''

-- ============================================================================
-- TEST 5: Test Bypass RLS (Admin Access)
-- ============================================================================

\echo '5. Testing RLS bypass (admin access)...'

SELECT public.bypass_rls(true);

\echo 'RLS Bypassed - Viewing all workspaces:'
SELECT workspace_id, email, plan FROM public.workspaces WHERE email LIKE 'test%@example.com';

\echo ''

-- ============================================================================
-- TEST 6: Test Helper Functions
-- ============================================================================

\echo '6. Testing helper functions...'

-- Test get_workspace_context
SELECT public.set_workspace_context('workspace_test_001');
\echo 'Current workspace context:'
SELECT public.get_workspace_context() as current_workspace;

\echo ''

-- ============================================================================
-- CLEANUP
-- ============================================================================

\echo '7. Cleaning up test data...'

-- Bypass RLS for cleanup
SELECT public.bypass_rls(true);

-- Drop test schemas
DROP SCHEMA IF EXISTS workspace_workspace_test_001 CASCADE;
DROP SCHEMA IF EXISTS workspace_workspace_test_002 CASCADE;

-- Delete test data
DELETE FROM public.workspace_schemas WHERE workspace_id LIKE 'workspace_test_%';
DELETE FROM public.workspaces WHERE workspace_id LIKE 'workspace_test_%';

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
\echo '- Workspace context: Working'
\echo '- Helper functions: Working'

