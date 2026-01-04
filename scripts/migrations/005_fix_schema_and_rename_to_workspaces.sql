-- ============================================================================
-- Migration 005: Fix Schema and Rename Tenant → Workspace
-- ============================================================================
-- Purpose: 
--   1. Remove role column from tenants (roles only exist in junction table)
--   2. Rename tenant → workspace throughout the database
--   3. A single user can have different roles in different workspaces
-- ============================================================================

-- ============================================================================
-- Part 1: Remove role column from tenants
-- ============================================================================

ALTER TABLE public.tenants DROP COLUMN IF EXISTS role;

COMMENT ON TABLE public.tenants IS 
'Organizations/firms - will be renamed to workspaces in this migration';

-- ============================================================================
-- Part 2: Rename tenant → workspace throughout database
-- ============================================================================

-- 2.1: Rename main table
ALTER TABLE public.tenants RENAME TO workspaces;

-- 2.2: Rename columns that reference tenants
ALTER TABLE public.workspaces RENAME COLUMN tenant_id TO workspace_id;

-- 2.3: Update tenant_schemas table
ALTER TABLE public.tenant_schemas RENAME TO workspace_schemas;
ALTER TABLE public.workspace_schemas RENAME COLUMN tenant_id TO workspace_id;

-- 2.4: Update user_tenants table
ALTER TABLE public.user_tenants RENAME TO user_workspaces;
ALTER TABLE public.user_workspaces RENAME COLUMN tenant_id TO workspace_id;

-- 2.5: Update foreign key constraints
ALTER TABLE public.user_workspaces 
DROP CONSTRAINT IF EXISTS fk_user_tenants_tenant;

ALTER TABLE public.user_workspaces 
ADD CONSTRAINT fk_user_workspaces_workspace 
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE;

ALTER TABLE public.workspace_schemas
DROP CONSTRAINT IF EXISTS tenant_schemas_tenant_id_fkey;

ALTER TABLE public.workspace_schemas
ADD CONSTRAINT workspace_schemas_workspace_id_fkey
FOREIGN KEY (workspace_id) REFERENCES public.workspaces(workspace_id) ON DELETE CASCADE;

-- ============================================================================
-- Part 3: Add 'owner' role to user_workspaces
-- ============================================================================

ALTER TABLE public.user_workspaces 
DROP CONSTRAINT IF EXISTS user_tenants_role_check;

ALTER TABLE public.user_workspaces 
ADD CONSTRAINT user_workspaces_role_check 
CHECK (role IN ('owner', 'admin', 'member', 'viewer'));

-- ============================================================================
-- Part 4: Update RLS policies
-- ============================================================================

-- Drop old policies
DROP POLICY IF EXISTS tenant_isolation_policy ON public.workspaces;
DROP POLICY IF EXISTS tenant_schema_isolation_policy ON public.workspace_schemas;

-- Create new policies with workspace naming
CREATE POLICY workspace_isolation_policy ON public.workspaces
    FOR ALL
    USING (
        workspace_id = current_setting('app.current_workspace_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

CREATE POLICY workspace_schema_isolation_policy ON public.workspace_schemas
    FOR ALL
    USING (
        workspace_id = current_setting('app.current_workspace_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

-- ============================================================================
-- Part 5: Update helper functions
-- ============================================================================

-- Rename tenant context functions to workspace context
DROP FUNCTION IF EXISTS public.set_tenant_context(VARCHAR);
DROP FUNCTION IF EXISTS public.get_tenant_context();

CREATE OR REPLACE FUNCTION public.set_workspace_context(p_workspace_id VARCHAR)
RETURNS VOID AS $$
BEGIN
    PERFORM set_config('app.current_workspace_id', p_workspace_id, false);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.get_workspace_context()
RETURNS VARCHAR AS $$
BEGIN
    RETURN current_setting('app.current_workspace_id', true);
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Part 6: Update indexes (rename for consistency)
-- ============================================================================

DROP INDEX IF EXISTS idx_tenants_tenant_id;
DROP INDEX IF EXISTS idx_tenants_email;
DROP INDEX IF EXISTS idx_tenants_plan;
DROP INDEX IF EXISTS idx_tenants_is_active;

CREATE INDEX IF NOT EXISTS idx_workspaces_workspace_id ON public.workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspaces_email ON public.workspaces(email);
CREATE INDEX IF NOT EXISTS idx_workspaces_plan ON public.workspaces(plan);
CREATE INDEX IF NOT EXISTS idx_workspaces_is_active ON public.workspaces(is_active);

DROP INDEX IF EXISTS idx_tenant_schemas_tenant_id;
DROP INDEX IF EXISTS idx_tenant_schemas_schema_name;

CREATE INDEX IF NOT EXISTS idx_workspace_schemas_workspace_id ON public.workspace_schemas(workspace_id);
CREATE INDEX IF NOT EXISTS idx_workspace_schemas_schema_name ON public.workspace_schemas(schema_name);

DROP INDEX IF EXISTS idx_user_tenants_user_id;
DROP INDEX IF EXISTS idx_user_tenants_tenant_id;
DROP INDEX IF EXISTS idx_user_tenants_is_active;

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_id ON public.user_workspaces(user_id);
CREATE INDEX IF NOT EXISTS idx_user_workspaces_workspace_id ON public.user_workspaces(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_workspaces_is_active ON public.user_workspaces(is_active);

-- ============================================================================
-- Part 7: Update triggers
-- ============================================================================

DROP TRIGGER IF EXISTS update_tenants_updated_at ON public.workspaces;

CREATE TRIGGER update_workspaces_updated_at
    BEFORE UPDATE ON public.workspaces
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_tenants_updated_at ON public.user_workspaces;

CREATE TRIGGER update_user_workspaces_updated_at
    BEFORE UPDATE ON public.user_workspaces
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- Part 8: Update comments
-- ============================================================================

COMMENT ON TABLE public.workspaces IS 
'Workspaces (firms/organizations) - billing and isolation boundary';

COMMENT ON COLUMN public.workspaces.workspace_id IS 
'Unique workspace identifier (workspace_<uuid>)';

COMMENT ON TABLE public.user_workspaces IS 
'Many-to-many: users can belong to multiple workspaces';

COMMENT ON COLUMN public.user_workspaces.role IS 
'User role within workspace: owner (creator), admin (full access), member (standard), viewer (read-only)';

COMMENT ON TABLE public.workspace_schemas IS 
'Tracks workspace database schemas (may be removed per COM-64 RLS decision)';

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 005: Schema fixed and renamed to workspaces';
    RAISE NOTICE '   - Removed tenants.role column';
    RAISE NOTICE '   - Renamed tenant → workspace throughout database';
    RAISE NOTICE '   - Added owner role to user_workspaces';
    RAISE NOTICE '   - Updated all indexes, policies, and functions';
END $$;

