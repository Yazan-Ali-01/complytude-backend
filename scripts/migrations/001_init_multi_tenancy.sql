-- ============================================================================
-- Migration 001: Multi-Tenancy Infrastructure (Pure RLS)
-- ============================================================================
-- Description: Multi-tenancy setup with Row Level Security (no schema isolation)
-- Dependencies: None
-- ============================================================================

-- Create UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. TENANT MANAGEMENT TABLE
-- ============================================================================

-- Main tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'user', 'viewer')),
    plan VARCHAR(50) NOT NULL CHECK (plan IN ('early_access', 'basic', 'pro', 'enterprise')),
    features JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.tenants IS 'Main tenants table with plan and custom features support (Pure RLS approach)';
COMMENT ON COLUMN public.tenants.features IS 'Custom feature overrides (JSONB) - overrides plan defaults';
COMMENT ON COLUMN public.tenants.plan IS 'Subscription plan: early_access, basic, pro, enterprise';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tenants_tenant_id ON public.tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenants_email ON public.tenants(email);
CREATE INDEX IF NOT EXISTS idx_tenants_plan ON public.tenants(plan);
CREATE INDEX IF NOT EXISTS idx_tenants_is_active ON public.tenants(is_active);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on tenants table
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants FORCE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS tenant_isolation_policy ON public.tenants;

-- Policy: Users can only access their own tenant data
CREATE POLICY tenant_isolation_policy ON public.tenants
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    )
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- ============================================================================
-- 4. HELPER FUNCTIONS
-- ============================================================================

-- Set tenant context (used by application)
CREATE OR REPLACE FUNCTION public.set_tenant_context(p_tenant_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_tenant_id', p_tenant_id, false);
END;
$$ LANGUAGE plpgsql;

-- Get current tenant context
CREATE OR REPLACE FUNCTION public.get_tenant_context()
RETURNS VARCHAR AS $$
BEGIN
    RETURN current_setting('app.current_tenant_id', true);
END;
$$ LANGUAGE plpgsql;

-- Bypass RLS (admin use only)
CREATE OR REPLACE FUNCTION public.bypass_rls(p_bypass BOOLEAN)
RETURNS VOID AS $$
BEGIN
    IF p_bypass THEN
        PERFORM set_config('app.bypass_rls', 'true', false);
    ELSE
        PERFORM set_config('app.bypass_rls', 'false', false);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Auto-update updated_at column
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_tenants_updated_at
    BEFORE UPDATE ON public.tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 6. PERMISSIONS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO app_user;
        RAISE NOTICE '✅ Granted permissions to app_user role';
    ELSE
        RAISE WARNING '⚠️  Role app_user does not exist. Granting to CURRENT_USER instead.';
        RAISE WARNING '    For production, create: CREATE ROLE app_user NOLOGIN;';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO ' || CURRENT_USER;
    END IF;
END $$;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 001: Multi-tenancy infrastructure initialized (Pure RLS)';
    RAISE NOTICE 'ℹ️  No schema-based isolation - all data in public schema with RLS';
END $$;
