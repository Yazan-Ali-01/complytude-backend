-- ============================================================================
-- Multi-Tenancy Verification Script
-- ============================================================================
-- Run this script to verify that multi-tenancy is properly configured
-- ============================================================================

\echo '=================================='
\echo 'Multi-Tenancy Verification Report'
\echo '=================================='
\echo ''

-- Check if tables exist
\echo '1. Checking if core tables exist...'
SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenants')
        THEN '✓ public.tenants exists'
        ELSE '✗ public.tenants missing'
    END as tenant_table_status;

SELECT 
    CASE 
        WHEN EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'tenant_schemas')
        THEN '✓ public.tenant_schemas exists'
        ELSE '✗ public.tenant_schemas missing'
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
    AND tablename IN ('tenants', 'tenant_schemas')
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
    AND tablename IN ('tenants', 'tenant_schemas')
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
    AND tablename IN ('tenants', 'tenant_schemas')
ORDER BY tablename, indexname;

\echo ''
\echo '5. Checking Helper Functions...'
SELECT 
    proname as function_name,
    pg_get_function_arguments(oid) as arguments,
    CASE 
        WHEN proname IN ('set_tenant_context', 'get_tenant_context', 'bypass_rls', 'update_updated_at_column')
        THEN '✓ Available'
        ELSE 'Unknown'
    END as status
FROM pg_proc 
WHERE pronamespace = 'public'::regnamespace
    AND proname IN ('set_tenant_context', 'get_tenant_context', 'bypass_rls', 'update_updated_at_column');

\echo ''
\echo '6. Tenant Statistics...'
SELECT 
    COUNT(*) as total_tenants,
    COUNT(CASE WHEN is_active THEN 1 END) as active_tenants,
    COUNT(CASE WHEN NOT is_active THEN 1 END) as inactive_tenants
FROM public.tenants;

\echo ''
\echo '7. Listing All Tenant Schemas...'
SELECT 
    t.tenant_id,
    t.email,
    t.plan,
    ts.schema_name,
    t.is_active,
    t.created_at
FROM public.tenants t
LEFT JOIN public.tenant_schemas ts ON t.tenant_id = ts.tenant_id
ORDER BY t.created_at DESC;

\echo ''
\echo '=================================='
\echo 'Verification Complete'
\echo '=================================='

