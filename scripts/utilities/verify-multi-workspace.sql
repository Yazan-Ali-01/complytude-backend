-- ============================================================================
-- Multi-Workspace Verification Script
-- ============================================================================
-- Run this script to verify that multi-workspace is properly configured
-- ============================================================================

\echo '=================================='
\echo 'Multi-Workspace Verification Report'
\echo '=================================='
\echo ''

-- Check if tables exist
\echo '1. Checking if core tables exist...'
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspaces')
        THEN '✓ public.workspaces exists'
        ELSE '✗ public.workspaces missing'
    END as workspace_table_status;

SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'workspace_schemas')
        THEN '✓ public.workspace_schemas exists'
        ELSE '✗ public.workspace_schemas missing'
    END as schema_table_status;

\echo ''
\echo '2. Checking Row Level Security (RLS) status...'
SELECT 
    tablename,
    CASE 
        WHEN rowsecurity THEN '✓ RLS Enabled'
        ELSE '✗ RLS Disabled'
    END as rls_status
FROM pg_tables 
WHERE schemaname = 'public' 
    AND tablename IN ('workspaces', 'workspace_schemas')
ORDER BY tablename;

\echo ''
\echo '3. Checking RLS Policies...'
SELECT 
    tablename,
    policyname,
    cmd as operation,
    CASE 
        WHEN permissive = 'PERMISSIVE' THEN '✓ Permissive'
        ELSE 'Restrictive'
    END as policy_type
FROM pg_policies 
WHERE schemaname = 'public'
    AND tablename IN ('workspaces', 'workspace_schemas')
ORDER BY tablename, policyname;

\echo ''
\echo '4. Checking Indexes...'
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public' 
    AND tablename IN ('workspaces', 'workspace_schemas')
ORDER BY tablename, indexname;

\echo ''
\echo '5. Checking Helper Functions...'
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    CASE 
        WHEN proname IN ('set_workspace_context', 'get_workspace_context', 'bypass_rls', 'update_updated_at_column')
        THEN '✓ Available'
        ELSE 'Unknown'
    END as status
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('set_workspace_context', 'get_workspace_context', 'bypass_rls', 'update_updated_at_column');

\echo ''
\echo '6. Workspace Statistics...'
SELECT 
    COUNT(*) as total_workspaces,
    COUNT(CASE WHEN is_active THEN 1 END) as active_workspaces,
    COUNT(CASE WHEN NOT is_active THEN 1 END) as inactive_workspaces
FROM public.workspaces;

\echo ''
\echo '7. Listing All Workspace Schemas...'
SELECT 
    w.workspace_id,
    w.email,
    w.plan,
    ws.schema_name,
    w.is_active,
    w.created_at
FROM public.workspaces w
LEFT JOIN public.workspace_schemas ws ON w.workspace_id = ws.workspace_id
ORDER BY w.created_at DESC;

\echo ''
\echo '=================================='
\echo 'Verification Complete'
\echo '=================================='

