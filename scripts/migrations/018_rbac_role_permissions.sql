-- =========================
-- Migration 018: RBAC Role Permissions Table
-- =========================
-- Description: Maps role names to permissions (no separate roles table - fixed roles)
-- =========================

BEGIN;

-- =========================
-- ROLE PERMISSIONS TABLE
-- =========================
CREATE TABLE public.role_permissions (
    role_name VARCHAR(50) NOT NULL,
    permission_id UUID NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (role_name, permission_id),
    CONSTRAINT fk_rp_permission FOREIGN KEY (permission_id)
        REFERENCES public.permissions(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.role_permissions IS 'Maps role names to permissions (role names are from tenant_role enum)';
COMMENT ON COLUMN public.role_permissions.role_name IS 'Role identifier from tenant_role enum';
COMMENT ON COLUMN public.role_permissions.permission_id IS 'Reference to permission';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_role_permissions_role ON public.role_permissions(role_name);
CREATE INDEX idx_role_permissions_permission ON public.role_permissions(permission_id);

-- =========================
-- GRANTS
-- =========================
GRANT SELECT ON public.role_permissions TO complytude_app;
GRANT ALL ON public.role_permissions TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS idx_role_permissions_permission;
DROP INDEX IF EXISTS idx_role_permissions_role;
DROP TABLE IF EXISTS public.role_permissions;
COMMIT;
*/