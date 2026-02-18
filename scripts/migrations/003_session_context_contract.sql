BEGIN;

-- =========================
-- Migration 003: Session Context Contract
-- =========================
-- Description: Helper functions to read session variables set by the application layer
-- These functions provide access to JWT claims and auth context stored in PostgreSQL session variables
-- =========================

-- =========================
-- Session Context Getters (Strict Versions)
-- =========================
-- These functions throw exceptions if session context is not set
-- Use these in application code where context MUST be present

-- Get current tenant context (strict)
CREATE FUNCTION public.current_tenant_id()
RETURNS UUID
LANGUAGE plpgsql
STABLE
-- VOLATILE
AS $$
DECLARE
    tenant_id_val TEXT;
BEGIN
    tenant_id_val := current_setting('app.tenant_id', true);
    
    IF tenant_id_val IS NULL OR tenant_id_val = '' THEN
        RAISE EXCEPTION 'Session context app.tenant_id not set';
    END IF;
    
    RETURN tenant_id_val::UUID;
END;
$$;

COMMENT ON FUNCTION public.current_tenant_id IS 'Get current tenant ID from session context (throws exception if not set)';

-- =========================
-- Session Context Getters (Permissive Versions)
-- =========================
-- These functions return NULL if session context is not set
-- Use these in RLS policies where NULL is acceptable

-- Get current tenant context (permissive)
CREATE FUNCTION public.current_tenant_id_or_null()
RETURNS UUID
LANGUAGE plpgsql
STABLE
-- VOLATILE
AS $$
DECLARE
    tenant_id_val TEXT;
BEGIN
    tenant_id_val := current_setting('app.tenant_id', true);
    
    IF tenant_id_val IS NULL OR tenant_id_val = '' THEN
        RETURN NULL;
    END IF;
    
    RETURN tenant_id_val::UUID;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.current_tenant_id_or_null IS 'Get current tenant ID from session context (returns NULL if not set, for use in RLS policies)';

-- =========================
-- Boolean Context Flags
-- =========================

-- Check if current user is tenant admin (from user_tenants.role)
CREATE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
-- VOLATILE
AS $$
DECLARE
    role_val TEXT;
BEGIN
    role_val := current_setting('app.user_tenant_role', true);
    RETURN role_val = 'tenant_admin';
END;
$$;

COMMENT ON FUNCTION public.is_tenant_admin IS 'Check if current user has tenant admin role (from user_tenants.role in session context)';

-- Check if current operation is an auth flow (signup, login, password reset, etc.)
CREATE FUNCTION public.is_auth_flow()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
-- VOLATILE
AS $$
BEGIN
    RETURN COALESCE(current_setting('app.is_auth_flow', true), 'false') = 'true';
END;
$$;

COMMENT ON FUNCTION public.is_auth_flow IS 'Check if current operation is an auth flow (signup, login, password reset, etc.)';

-- Check if current user has a platform role (system admin, support, etc.)
-- Used for RLS: platform admins can see all tenants and user_tenants
CREATE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    role_val TEXT;
BEGIN
    role_val := current_setting('app.platform_role', true);
    RETURN role_val IS NOT NULL AND role_val != '';
END;
$$;

COMMENT ON FUNCTION public.is_platform_admin IS 'Check if current user has platform role (from app.platform_role session context). Used for RLS to allow platform admins to see all tenants.';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop all session context functions
DROP FUNCTION IF EXISTS public.is_platform_admin();
DROP FUNCTION IF EXISTS public.is_auth_flow();
DROP FUNCTION IF EXISTS public.is_tenant_admin();
DROP FUNCTION IF EXISTS public.current_tenant_id_or_null();
DROP FUNCTION IF EXISTS public.current_tenant_id();

COMMIT;
*/