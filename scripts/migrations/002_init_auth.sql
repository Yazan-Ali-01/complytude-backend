-- ============================================================================
-- Migration 002: Authentication & User Management (Tenant RLS + System Auth Tables)
-- ============================================================================
-- Description: User accounts, multi-tenant access, and auth tokens with RLS
-- Dependencies: 001_init_multi_tenancy.sql
-- ============================================================================

-- ============================================================================
-- 1. USERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.users (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    is_verified BOOLEAN DEFAULT false,
    is_system_admin BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_is_verified ON public.users(is_verified);
CREATE INDEX IF NOT EXISTS idx_users_is_system_admin ON public.users(is_system_admin);

COMMENT ON TABLE public.users IS 'User accounts that can access multiple tenants';
COMMENT ON COLUMN public.users.id IS 'Unique user identifier (user_<uuid>)';
COMMENT ON COLUMN public.users.password_hash IS 'Bcrypt hashed password';
COMMENT ON COLUMN public.users.is_system_admin IS 'System-level admin flag for platform administration (not tenant-specific)';

-- ============================================================================
-- 2. USER-TENANT ASSOCIATIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_tenants (
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'member', 'viewer')),
    is_active BOOLEAN DEFAULT true,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, tenant_id),
    CONSTRAINT fk_user_tenants_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_tenants_tenant FOREIGN KEY (tenant_id) 
        REFERENCES public.tenants(tenant_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_tenants_user_id ON public.user_tenants(user_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_tenant_id ON public.user_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_tenants_is_active ON public.user_tenants(is_active);

COMMENT ON TABLE public.user_tenants IS 'Many-to-many: users can belong to multiple tenants';
COMMENT ON COLUMN public.user_tenants.role IS 'Role within tenant: admin, member, viewer';

-- ============================================================================
-- 3. REFRESH TOKENS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.refresh_tokens (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP,
    CONSTRAINT fk_refresh_tokens_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON public.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON public.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON public.refresh_tokens(expires_at);

COMMENT ON TABLE public.refresh_tokens IS 'Refresh tokens for session management';

-- ============================================================================
-- 4. EMAIL VERIFICATION
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_verifications (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    verified_at TIMESTAMP,
    CONSTRAINT fk_email_verifications_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON public.email_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_token ON public.email_verifications(token);
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires_at ON public.email_verifications(expires_at);

COMMENT ON TABLE public.email_verifications IS 'Email verification tokens';

-- ============================================================================
-- 5. PASSWORD RESETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.password_resets (
    id VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    used_at TIMESTAMP,
    CONSTRAINT fk_password_resets_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON public.password_resets(user_id);
CREATE INDEX IF NOT EXISTS idx_password_resets_token ON public.password_resets(token);
CREATE INDEX IF NOT EXISTS idx_password_resets_expires_at ON public.password_resets(expires_at);

COMMENT ON TABLE public.password_resets IS 'Password reset tokens';

-- ============================================================================
-- 6. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on all auth tables
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_tenants FORCE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS users_isolation_policy ON public.users;
DROP POLICY IF EXISTS user_tenants_isolation_policy ON public.user_tenants;

-- Users: Can see users that belong to the same tenant
CREATE POLICY users_isolation_policy ON public.users
    FOR ALL
    USING (
        id IN (
            SELECT user_id FROM public.user_tenants 
            WHERE tenant_id = current_setting('app.current_tenant_id', true)
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    )
    WITH CHECK (
        id IN (
            SELECT user_id FROM public.user_tenants 
            WHERE tenant_id = current_setting('app.current_tenant_id', true)
        )
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- User-Tenants: Can see associations for current tenant
CREATE POLICY user_tenants_isolation_policy ON public.user_tenants
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
-- 7. CLEANUP FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION cleanup_expired_tokens() RETURNS void AS $$
BEGIN
    -- Delete old verification tokens
    DELETE FROM public.email_verifications 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Delete old password reset tokens
    DELETE FROM public.password_resets 
    WHERE expires_at < NOW() - INTERVAL '7 days';
    
    -- Delete old refresh tokens
    DELETE FROM public.refresh_tokens 
    WHERE (expires_at < NOW() - INTERVAL '30 days') 
       OR (revoked_at IS NOT NULL AND revoked_at < NOW() - INTERVAL '30 days');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_tokens IS 'Cleanup expired tokens (run daily)';

-- ============================================================================
-- 8. SYSTEM ADMIN HELPER FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_system_admin(user_id_param VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    is_admin BOOLEAN;
BEGIN
    SELECT is_system_admin INTO is_admin
    FROM public.users
    WHERE id = user_id_param;
    
    RETURN COALESCE(is_admin, false);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.is_system_admin IS 'Check if a user is a system administrator';

-- ============================================================================
-- 9. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON public.users
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_tenants_updated_at
    BEFORE UPDATE ON public.user_tenants
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 10. PERMISSIONS
-- ============================================================================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tenants TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO app_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_resets TO app_user;
        GRANT EXECUTE ON FUNCTION public.is_system_admin TO app_user;
        RAISE NOTICE '✅ Granted auth permissions to app_user role';
    ELSE
        RAISE WARNING '⚠️  Role app_user does not exist. Granting to CURRENT_USER instead.';
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.users TO ' || CURRENT_USER;
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tenants TO ' || CURRENT_USER;
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens TO ' || CURRENT_USER;
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO ' || CURRENT_USER;
        EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_resets TO ' || CURRENT_USER;
        EXECUTE 'GRANT EXECUTE ON FUNCTION public.is_system_admin TO ' || CURRENT_USER;
    END IF;
END $$;

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 002: Authentication schema initialized with RLS';
    RAISE NOTICE '✅ System admin role included';
    RAISE NOTICE 'ℹ️  To create a system admin, run:';
    RAISE NOTICE '   UPDATE public.users SET is_system_admin = true WHERE email = ''your@email.com'';';
END $$;
