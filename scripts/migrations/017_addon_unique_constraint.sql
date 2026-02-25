BEGIN;

-- =========================
-- Migration 013: Add Unique Constraint for Active Addons
-- =========================
-- Description: Prevent duplicate active addons per tenant
-- Partial unique index allows the same addon to exist multiple times
-- if status is not 'active' (e.g., cancelled, expired)
-- =========================

-- Partial unique index: one active addon per tenant
CREATE UNIQUE INDEX idx_tenant_addons_unique_active
ON public.tenant_addons (tenant_id, addon_id)
WHERE status = 'active';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS public.idx_tenant_addons_unique_active;
COMMIT;
*/
