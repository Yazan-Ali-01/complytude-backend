BEGIN;

-- =========================
-- Migration 005: RLS Policies and Cleanup Functions
-- =========================
-- Description: Row-level security policies for tenant-related tables
-- These policies enforce tenant isolation and role-based access control
-- Also includes cleanup function for expired auth tokens
-- =========================

-- =========================
-- tenants
-- =========================

-- Users can only see their current tenant
CREATE POLICY tenant_select
ON public.tenants
FOR SELECT
USING (
    id = current_tenant_id_or_null() OR is_auth_flow()
);

-- Tenant creation happens during signup (auth flow)
CREATE POLICY tenant_insert
ON public.tenants
FOR INSERT
WITH CHECK (
    is_auth_flow()
);

-- Tenant admins can update their tenant settings
CREATE POLICY tenant_update
ON public.tenants
FOR UPDATE
USING (
    id = current_tenant_id_or_null()
    AND is_tenant_admin()
)
WITH CHECK (
    id = current_tenant_id_or_null()
    AND is_tenant_admin()
);

-- =========================
-- user_tenants
-- =========================

-- Users can see all members of their current tenant
CREATE POLICY user_tenants_select
ON public.user_tenants
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_auth_flow()
);

-- User-tenant association created during signup (auth flow)
CREATE POLICY user_tenants_auth_insert
ON public.user_tenants
FOR INSERT
WITH CHECK (
    is_auth_flow()
);

-- Only tenant admins can add new members to their tenant
CREATE POLICY user_tenants_admin_insert
ON public.user_tenants
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null()
    AND is_tenant_admin()
);

-- Only tenant admins can update tenant membership (e.g., change roles)
CREATE POLICY user_tenants_admin_update
ON public.user_tenants
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null()
    AND is_tenant_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null()
    AND is_tenant_admin()
);

-- Only tenant admins can remove members from their tenant
CREATE POLICY user_tenants_admin_delete
ON public.user_tenants
FOR DELETE
USING (
    tenant_id = current_tenant_id_or_null()
    AND is_tenant_admin()
);

-- =========================
-- Cleanup Function for Auth Tokens
-- =========================

-- Function to clean up expired and old tokens
-- Should be run periodically (e.g., daily via cron job or scheduled task)
CREATE OR REPLACE FUNCTION public.cleanup_expired_tokens()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    -- Delete refresh tokens that have been revoked for 30+ days
    DELETE FROM public.refresh_tokens
    WHERE revoked_at IS NOT NULL
      AND revoked_at < NOW() - INTERVAL '30 days';
    
    -- Delete refresh tokens that expired 30+ days ago
    DELETE FROM public.refresh_tokens
    WHERE expires_at < NOW() - INTERVAL '30 days';
    
    -- Delete email verification tokens that expired 7+ days ago
    DELETE FROM public.email_verifications
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Delete password reset tokens that expired 7+ days ago
    DELETE FROM public.password_resets
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    RAISE NOTICE 'Cleanup completed: expired tokens removed';
END;
$$;

COMMENT ON FUNCTION public.cleanup_expired_tokens IS 'Cleanup expired auth tokens: refresh tokens (30+ days), email verifications (7+ days), password resets (7+ days). Run daily via scheduled job.';

-- Function to mark expired invitations
CREATE OR REPLACE FUNCTION public.mark_expired_invitations()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    -- Update pending invitations that have passed their expiration date
    UPDATE public.invitations
    SET status = 'expired',
        updated_at = NOW()
    WHERE status = 'pending'
      AND expires_at < NOW();
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    
    RETURN affected_rows;
END;
$$;

COMMENT ON FUNCTION public.mark_expired_invitations IS 'Mark pending invitations as expired if they have passed their expiration date. Returns count of expired invitations. Run periodically (e.g., hourly).';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop cleanup function
DROP FUNCTION IF EXISTS public.cleanup_expired_tokens();
DROP FUNCTION IF EXISTS public.mark_expired_invitations();

-- Drop all policies on user_tenants
DROP POLICY IF EXISTS user_tenants_admin_delete ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_admin_update ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_admin_insert ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_auth_insert ON public.user_tenants;
DROP POLICY IF EXISTS user_tenants_select ON public.user_tenants;

-- Drop all policies on tenants
DROP POLICY IF EXISTS tenant_update ON public.tenants;
DROP POLICY IF EXISTS tenant_insert ON public.tenants;
DROP POLICY IF EXISTS tenant_select ON public.tenants;

COMMIT;
*/
