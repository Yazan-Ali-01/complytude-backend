-- ============================================================================
-- Migration 006: Role-Based Access Control (RBAC) - COM-73
-- ============================================================================
-- Description: Implement tenant-scoped RBAC system with permissions, 
--              role-permission mappings, and audit logging.
-- Dependencies: 002_init_auth.sql
-- ============================================================================

-- ============================================================================
-- 1. PERMISSIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.permissions (
    id VARCHAR(255) PRIMARY KEY DEFAULT ('permission_' || uuid_generate_v4()),
    key VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.permissions IS 'Permission definitions for RBAC system';
COMMENT ON COLUMN public.permissions.key IS 'Permission string in format resource:action (e.g., documents:create)';
COMMENT ON COLUMN public.permissions.resource IS 'Resource type (e.g., documents, contracts, templates)';
COMMENT ON COLUMN public.permissions.action IS 'Action type (e.g., create, read, delete, analyze)';

CREATE INDEX IF NOT EXISTS idx_permissions_key ON public.permissions(key);
CREATE INDEX IF NOT EXISTS idx_permissions_resource ON public.permissions(resource);
CREATE INDEX IF NOT EXISTS idx_permissions_is_active ON public.permissions(is_active);

-- ============================================================================
-- 2. ROLE-PERMISSION MAPPINGS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id VARCHAR(255) PRIMARY KEY DEFAULT ('role_perm_' || uuid_generate_v4()),
    role VARCHAR(50) NOT NULL,
    permission_key VARCHAR(100) NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role, permission_key)
);

COMMENT ON TABLE public.role_permissions IS 'Maps roles to their permissions';
COMMENT ON COLUMN public.role_permissions.role IS 'Tenant role: tenant_admin, legal_counsel, member, viewer';
COMMENT ON COLUMN public.role_permissions.permission_key IS 'Permission key from permissions table';

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON public.role_permissions(role);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_key ON public.role_permissions(permission_key);

-- ============================================================================
-- 3. RBAC AUDIT LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.rbac_audit_log (
    id VARCHAR(255) PRIMARY KEY DEFAULT ('rbac_log_' || uuid_generate_v4()),
    user_id VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id VARCHAR(255),
    granted BOOLEAN NOT NULL,
    ai_model_used VARCHAR(100),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE public.rbac_audit_log IS 'Audit log for all RBAC permission checks';

CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_user_id ON public.rbac_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_tenant_id ON public.rbac_audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_role ON public.rbac_audit_log(role);
CREATE INDEX IF NOT EXISTS idx_rbac_audit_log_created_at ON public.rbac_audit_log(created_at DESC);

-- ============================================================================
-- 4. PARENT TENANT COLUMN FOR AGENCY HIERARCHY
-- ============================================================================

ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS parent_tenant_id VARCHAR(255) REFERENCES public.tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_parent_tenant_id ON public.tenants(parent_tenant_id);

COMMENT ON COLUMN public.tenants.parent_tenant_id IS 'For agency/partner hierarchy - reference to parent tenant (nullable)';

-- ============================================================================
-- 5. INSERT PERMISSIONS
-- ============================================================================

INSERT INTO public.permissions (key, resource, action, description, is_active) VALUES
    ('documents:create', 'documents', 'create', 'Create new documents', true),
    ('documents:read', 'documents', 'read', 'Read documents', true),
    ('documents:delete', 'documents', 'delete', 'Delete documents', true),
    ('contracts:analyze', 'contracts', 'analyze', 'Run contract analysis', true),
    ('contracts:redline', 'contracts', 'redline', 'Redline contracts', true),
    ('templates:manage', 'templates', 'manage', 'Create and edit templates', true),
    ('templates:use', 'templates', 'use', 'Use templates to generate documents', true),
    ('regulatory:query', 'regulatory', 'query', 'Query regulatory hub', true),
    ('billing:manage', 'billing', 'manage', 'Manage billing and subscription', true),
    ('team:manage', 'team', 'manage', 'Manage team members', true),
    ('settings:manage', 'settings', 'manage', 'Manage tenant settings', true),
    ('settings:change_jurisdiction', 'settings', 'change_jurisdiction', 'Change legal jurisdiction settings', true),
    ('pii:view_unmasked', 'pii', 'view_unmasked', 'View unmasked PII in documents', true),
    ('ai:use_premium_models', 'ai', 'use_premium_models', 'Use premium AI models', true)
ON CONFLICT (key) DO NOTHING;

-- ============================================================================
-- 6. INSERT ROLE-PERMISSION MAPPINGS
-- ============================================================================

-- tenant_admin: Full access including billing, team, and jurisdiction management
INSERT INTO public.role_permissions (role, permission_key) VALUES
    ('tenant_admin', 'documents:create'),
    ('tenant_admin', 'documents:read'),
    ('tenant_admin', 'documents:delete'),
    ('tenant_admin', 'contracts:analyze'),
    ('tenant_admin', 'contracts:redline'),
    ('tenant_admin', 'templates:manage'),
    ('tenant_admin', 'templates:use'),
    ('tenant_admin', 'regulatory:query'),
    ('tenant_admin', 'billing:manage'),
    ('tenant_admin', 'team:manage'),
    ('tenant_admin', 'settings:manage'),
    ('tenant_admin', 'settings:change_jurisdiction'),
    ('tenant_admin', 'pii:view_unmasked'),
    ('tenant_admin', 'ai:use_premium_models')
ON CONFLICT (role, permission_key) DO NOTHING;

-- legal_counsel: Full document access and premium AI, but no billing/team/jurisdiction
INSERT INTO public.role_permissions (role, permission_key) VALUES
    ('legal_counsel', 'documents:create'),
    ('legal_counsel', 'documents:read'),
    ('legal_counsel', 'documents:delete'),
    ('legal_counsel', 'contracts:analyze'),
    ('legal_counsel', 'contracts:redline'),
    ('legal_counsel', 'templates:manage'),
    ('legal_counsel', 'templates:use'),
    ('legal_counsel', 'regulatory:query'),
    ('legal_counsel', 'pii:view_unmasked'),
    ('legal_counsel', 'ai:use_premium_models')
ON CONFLICT (role, permission_key) DO NOTHING;

-- member: Create documents, use templates, query regulatory hub (no delete/analyze/redline)
INSERT INTO public.role_permissions (role, permission_key) VALUES
    ('member', 'documents:create'),
    ('member', 'documents:read'),
    ('member', 'templates:use'),
    ('member', 'regulatory:query')
ON CONFLICT (role, permission_key) DO NOTHING;

-- viewer: Read-only access to documents and regulatory hub
INSERT INTO public.role_permissions (role, permission_key) VALUES
    ('viewer', 'documents:read'),
    ('viewer', 'regulatory:query')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ============================================================================
-- 7. ROLE MIGRATION
-- ============================================================================

-- Drop existing role constraint on user_tenants
ALTER TABLE public.user_tenants DROP CONSTRAINT IF EXISTS user_tenants_role_check;

-- Migrate existing 'admin' roles to 'tenant_admin'
UPDATE public.user_tenants 
SET role = 'tenant_admin', updated_at = CURRENT_TIMESTAMP 
WHERE role = 'admin';

-- Add new constraint with all four tenant roles
ALTER TABLE public.user_tenants
ADD CONSTRAINT user_tenants_role_check
CHECK (role IN ('tenant_admin', 'legal_counsel', 'member', 'viewer'));

-- ============================================================================
-- 8. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rbac_audit_log ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS permissions_read_policy ON public.permissions;
DROP POLICY IF EXISTS role_permissions_read_policy ON public.role_permissions;
DROP POLICY IF EXISTS rbac_audit_log_read_policy ON public.rbac_audit_log;

-- Permissions table: Allow read access for all users with bypass
CREATE POLICY permissions_read_policy ON public.permissions
    FOR SELECT
    USING (true);

-- Role permissions table: Allow read access for all users with bypass
CREATE POLICY role_permissions_read_policy ON public.role_permissions
    FOR SELECT
    USING (true);

-- RBAC audit log: Read access for tenant scope
CREATE POLICY rbac_audit_log_read_policy ON public.rbac_audit_log
    FOR SELECT
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- ============================================================================
-- 9. PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permissions TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO CURRENT_USER;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rbac_audit_log TO CURRENT_USER;

-- ============================================================================
-- 10. SUCCESS NOTIFICATION
-- ============================================================================

DO $$
DECLARE
    perm_count INTEGER;
    role_perm_count INTEGER;
    migrated_count INTEGER;
BEGIN
    -- Count permissions
    SELECT COUNT(*) INTO perm_count FROM public.permissions;
    
    -- Count role-permission mappings
    SELECT COUNT(*) INTO role_perm_count FROM public.role_permissions;
    
    -- Count migrated admin users
    SELECT COUNT(*) INTO migrated_count FROM public.user_tenants WHERE role = 'tenant_admin';
    
    RAISE NOTICE '✅ Migration 006: RBAC system initialized';
    RAISE NOTICE '✅ Created % permissions (14 expected)', perm_count;
    RAISE NOTICE '✅ Created % role-permission mappings (32 expected)', role_perm_count;
    RAISE NOTICE '✅ Migrated admin users to tenant_admin: % users affected', migrated_count;
    RAISE NOTICE '✅ Added parent_tenant_id column for agency hierarchy';
    RAISE NOTICE '✅ New roles: tenant_admin, legal_counsel, member, viewer';
END $$;