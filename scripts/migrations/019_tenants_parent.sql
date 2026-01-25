-- =========================
-- Migration 019: Add parent_tenant_id to tenants
-- =========================
-- Description: Adds parent_tenant_id column for agency hierarchy (future-proofing)
-- =========================

BEGIN;

-- =========================
-- ADD PARENT TENANT COLUMN
-- =========================
ALTER TABLE public.tenants
    ADD COLUMN parent_tenant_id UUID NULL,
    ADD CONSTRAINT fk_tenant_parent FOREIGN KEY (parent_tenant_id)
        REFERENCES public.tenants(id);

COMMENT ON COLUMN public.tenants.parent_tenant_id IS 'Parent tenant for agency/sub-tenant hierarchy';

-- =========================
-- INDEX
-- =========================
CREATE INDEX idx_tenants_parent ON public.tenants(parent_tenant_id);

-- =========================
-- GRANTS
-- =========================
GRANT SELECT ON public.tenants TO complytude_app;
GRANT ALL ON public.tenants TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS idx_tenants_parent;
ALTER TABLE public.tenants DROP CONSTRAINT IF EXISTS fk_tenant_parent;
ALTER TABLE public.tenants DROP COLUMN IF EXISTS parent_tenant_id;
COMMIT;
*/