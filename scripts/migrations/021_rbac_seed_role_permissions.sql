-- =========================
-- Migration 021: Seed Role Permission Mappings
-- =========================
-- Description: Maps roles to permissions based on the permission matrix
-- =========================

BEGIN;

-- =========================
-- tenant_admin: ALL permissions
-- =========================
INSERT INTO public.role_permissions (role_name, permission_id)
SELECT 'tenant_admin', id FROM public.permissions;

-- =========================
-- legal_counsel: documents:*, contracts:*, templates:*, regulatory:*, ai:*
-- =========================
INSERT INTO public.role_permissions (role_name, permission_id)
SELECT 'legal_counsel', id FROM public.permissions
WHERE name IN (
    'documents:create', 'documents:read', 'documents:delete',
    'contracts:analyze', 'contracts:redline',
    'templates:manage', 'templates:use',
    'regulatory:query',
    'ai:view_unmasked_pii', 'ai:use_premium_models'
);

-- =========================
-- member: limited access
-- =========================
INSERT INTO public.role_permissions (role_name, permission_id)
SELECT 'member', id FROM public.permissions
WHERE name IN ('documents:create', 'documents:read', 'templates:use', 'regulatory:query');

-- =========================
-- viewer: read-only
-- =========================
INSERT INTO public.role_permissions (role_name, permission_id)
SELECT 'viewer', id FROM public.permissions
WHERE name IN ('documents:read', 'regulatory:query');

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DELETE FROM public.role_permissions;
COMMIT;
*/