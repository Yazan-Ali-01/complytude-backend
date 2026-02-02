BEGIN;

-- =========================
-- Seed 006: RBAC - Roles and Permissions
-- =========================
-- Description: Seed base roles, permissions, and role-permission mappings
-- Base roles: tenant_admin, legal_counsel, member, viewer
-- Permissions: 12 permissions across documents, contracts, templates, regulatory, billing, team, settings
-- =========================

-- =========================
-- Insert Permissions
-- =========================

INSERT INTO public.permissions (key, name, resource, action, description) VALUES
-- Documents permissions
('documents:create', 'Create Documents', 'documents', 'create', 'Create new documents from templates'),
('documents:read', 'View Documents', 'documents', 'read', 'View and download documents'),
('documents:delete', 'Delete Documents', 'documents', 'delete', 'Delete documents from repository'),

-- Contracts permissions
('contracts:analyze', 'Analyze Contracts', 'contracts', 'analyze', 'Perform AI-powered contract analysis and risk assessment'),
('contracts:redline', 'Redline Contracts', 'contracts', 'redline', 'AI-assisted contract redlining and editing'),

-- Templates permissions
('templates:manage', 'Manage Templates', 'templates', 'manage', 'Create, edit, and manage document templates'),
('templates:use', 'Use Templates', 'templates', 'use', 'Use approved templates to generate documents'),

-- Regulatory permissions
('regulatory:query', 'Query Regulatory Hub', 'regulatory', 'query', 'Access and query regulatory information'),

-- Billing permissions
('billing:manage', 'Manage Billing', 'billing', 'manage', 'Manage subscription, invoices, and payment methods'),

-- Team permissions
('team:manage', 'Manage Team', 'team', 'manage', 'Invite, remove, and manage team members'),

-- Settings permissions
('settings:manage', 'Manage Settings', 'settings', 'manage', 'Manage tenant configuration and settings'),
('settings:change_jurisdiction', 'Change Jurisdiction', 'settings', 'change_jurisdiction', 'Change tenant jurisdiction (critical - affects legal logic)')
ON CONFLICT (key) DO NOTHING;

-- =========================
-- Insert Base Roles
-- =========================

INSERT INTO public.roles (key, name, description, tenant_id, is_system, is_active) VALUES
('tenant_admin', 'Tenant Admin', 'Full access to all features including billing, team management, and jurisdiction settings', NULL, true, true),
('legal_counsel', 'Legal Counsel', 'Full AI drafting, risk analysis, redlining, and template management', NULL, true, true),
('member', 'Member', 'Use approved wizards and generate documents from approved templates', NULL, true, true),
('viewer', 'Viewer', 'Read-only access to document repository', NULL, true, true)
ON CONFLICT (key, tenant_id) DO NOTHING;

-- =========================
-- Create Role-Permission Mappings
-- =========================

-- tenant_admin: All 12 permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'tenant_admin'
  AND r.is_system = true
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- legal_counsel: 9 permissions (no billing:manage, team:manage, settings:*)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'legal_counsel'
  AND r.is_system = true
  AND p.key IN (
    'documents:create',
    'documents:read',
    'documents:delete',
    'contracts:analyze',
    'contracts:redline',
    'templates:manage',
    'templates:use',
    'regulatory:query'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- member: 4 permissions (documents:create/read, templates:use, regulatory:query)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'member'
  AND r.is_system = true
  AND p.key IN (
    'documents:create',
    'documents:read',
    'templates:use',
    'regulatory:query'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- viewer: 2 permissions (documents:read, regulatory:query)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT 
    r.id,
    p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.key = 'viewer'
  AND r.is_system = true
  AND p.key IN (
    'documents:read',
    'regulatory:query'
  )
ON CONFLICT (role_id, permission_id) DO NOTHING;

COMMIT;

-- =========================
-- Verification Query
-- =========================
-- To verify the seed data, run:
/*
-- Check roles
SELECT key, name, is_system, is_active FROM public.roles WHERE is_system = true ORDER BY key;

-- Check permissions
SELECT key, name, resource, action FROM public.permissions ORDER BY resource, action;

-- Check role-permission mappings
SELECT 
    r.key as role_key,
    r.name as role_name,
    COUNT(rp.permission_id) as permission_count,
    STRING_AGG(p.key, ', ' ORDER BY p.key) as permissions
FROM public.roles r
LEFT JOIN public.role_permissions rp ON r.id = rp.role_id
LEFT JOIN public.permissions p ON rp.permission_id = p.id
WHERE r.is_system = true
GROUP BY r.key, r.name
ORDER BY r.key;
*/
