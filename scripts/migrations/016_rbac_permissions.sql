-- =========================
-- Migration 016: RBAC Permissions Table
-- =========================
-- Description: Creates the permissions table for role-based access control
-- =========================

BEGIN;

-- =========================
-- PERMISSIONS TABLE
-- =========================
CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    resource VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.permissions IS 'Defines all available permissions in the system';
COMMENT ON COLUMN public.permissions.name IS 'Permission identifier (e.g., documents:create)';
COMMENT ON COLUMN public.permissions.resource IS 'Resource type (e.g., documents, contracts)';
COMMENT ON COLUMN public.permissions.action IS 'Action type (e.g., create, read, delete)';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_permissions_name ON public.permissions(name);
CREATE INDEX idx_permissions_resource_action ON public.permissions(resource, action);

-- =========================
-- TRIGGERS
-- =========================
CREATE TRIGGER update_permissions_updated_at
    BEFORE UPDATE ON public.permissions
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- GRANTS
-- =========================
GRANT SELECT ON public.permissions TO complytude_app;
GRANT ALL ON public.permissions TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP TRIGGER IF EXISTS update_permissions_updated_at ON public.permissions;
DROP INDEX IF EXISTS idx_permissions_resource_action;
DROP INDEX IF EXISTS idx_permissions_name;
DROP TABLE IF EXISTS public.permissions;
COMMIT;
*/