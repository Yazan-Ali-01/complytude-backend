-- =========================
-- Migration 020: Seed RBAC Permissions
-- =========================
-- Description: Seeds all 14 permissions for the RBAC system
-- =========================

BEGIN;

-- =========================
-- SEED PERMISSIONS
-- =========================
INSERT INTO public.permissions (name, resource, action, description) VALUES
    -- Documents
    ('documents:create', 'documents', 'create', 'Create new documents'),
    ('documents:read', 'documents', 'read', 'View documents'),
    ('documents:delete', 'documents', 'delete', 'Delete documents'),

    -- Contracts
    ('contracts:analyze', 'contracts', 'analyze', 'Run AI contract analysis'),
    ('contracts:redline', 'contracts', 'redline', 'Perform redlining operations'),

    -- Templates
    ('templates:manage', 'templates', 'manage', 'Create/edit/delete templates'),
    ('templates:use', 'templates', 'use', 'Use templates to generate documents'),

    -- Regulatory
    ('regulatory:query', 'regulatory', 'query', 'Query regulatory information'),

    -- Billing
    ('billing:manage', 'billing', 'manage', 'Manage subscription and payments'),

    -- Team
    ('team:manage', 'team', 'manage', 'Add/remove/modify team members'),

    -- Settings
    ('settings:manage', 'settings', 'manage', 'Manage tenant settings'),
    ('settings:change_jurisdiction', 'settings', 'change_jurisdiction', 'Change legal jurisdiction'),

    -- AI-Specific
    ('ai:view_unmasked_pii', 'ai', 'view_unmasked_pii', 'View unmasked PII in documents'),
    ('ai:use_premium_models', 'ai', 'use_premium_models', 'Access to high-cost AI models');

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DELETE FROM public.permissions WHERE name IN (
    'documents:create', 'documents:read', 'documents:delete',
    'contracts:analyze', 'contracts:redline',
    'templates:manage', 'templates:use',
    'regulatory:query',
    'billing:manage',
    'team:manage',
    'settings:manage', 'settings:change_jurisdiction',
    'ai:view_unmasked_pii', 'ai:use_premium_models'
);
COMMIT;
*/