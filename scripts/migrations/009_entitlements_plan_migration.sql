BEGIN;

-- =========================
-- Migration 009: Add New Plan Enum Values
-- =========================
-- Description: Adds new plan tier values (navigator, shield, general_counsel, infrastructure) to tenant_plan enum
-- Note: Old values remain valid for backward compatibility during data migration in 013
-- =========================

ALTER TYPE tenant_plan ADD VALUE IF NOT EXISTS 'navigator';
ALTER TYPE tenant_plan ADD VALUE IF NOT EXISTS 'shield';
ALTER TYPE tenant_plan ADD VALUE IF NOT EXISTS 'general_counsel';
ALTER TYPE tenant_plan ADD VALUE IF NOT EXISTS 'infrastructure';

-- Old values remain valid for backward compatibility:
-- early_access, basic, pro, enterprise

COMMIT;

-- ROLLBACK: Cannot remove enum values in PostgreSQL
-- Data migration (013) will convert old values to new