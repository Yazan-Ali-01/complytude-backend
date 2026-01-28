BEGIN;

-- =========================
-- Migration 010: Features Registry + Overrides Table
-- =========================
-- Description: Creates features registry and tenant-specific feature overrides with audit trail for UAE PDPL compliance
-- =========================

CREATE TYPE feature_data_type AS ENUM ('boolean', 'number', 'enum', 'string');

-- =========================
-- FEATURES TABLE (Registry)
-- =========================
CREATE TABLE public.features (
    key             VARCHAR(100) PRIMARY KEY,
    data_type       feature_data_type NOT NULL,
    category        VARCHAR(50) NOT NULL,
    display_name    VARCHAR(255) NOT NULL,
    description     TEXT,
    enum_values     JSONB,
    default_value   JSONB,
    is_metered      BOOLEAN NOT NULL DEFAULT false,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.features IS 'Registry of all valid feature keys with metadata';

-- =========================
-- TENANT FEATURE OVERRIDES TABLE
-- =========================
CREATE TABLE public.tenant_feature_overrides (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    feature_key     VARCHAR(100) NOT NULL,
    value           JSONB NOT NULL,

    -- Audit trail (UAE PDPL compliance)
    granted_by      UUID,
    granted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    reason          TEXT,

    -- Time-limited overrides
    expires_at      TIMESTAMPTZ,

    -- Soft-delete for revocation (preserves audit trail)
    revoked_at      TIMESTAMPTZ,
    revoked_by      UUID,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_override_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_override_feature
        FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE RESTRICT,
    CONSTRAINT fk_override_granted_by
        FOREIGN KEY (granted_by) REFERENCES public.users(id) ON DELETE SET NULL,
    CONSTRAINT fk_override_revoked_by
        FOREIGN KEY (revoked_by) REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tenant_feature_overrides IS 'Per-tenant feature overrides with audit trail';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_overrides_tenant_id ON public.tenant_feature_overrides(tenant_id);
CREATE INDEX idx_overrides_expires_at ON public.tenant_feature_overrides(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_overrides_granted_by ON public.tenant_feature_overrides(granted_by) WHERE granted_by IS NOT NULL;
CREATE INDEX idx_overrides_feature_key ON public.tenant_feature_overrides(feature_key);
CREATE INDEX idx_overrides_revoked_at ON public.tenant_feature_overrides(revoked_at) WHERE revoked_at IS NOT NULL;

-- Only one active (non-revoked) override per tenant per feature
CREATE UNIQUE INDEX uq_tenant_feature_active
    ON public.tenant_feature_overrides(tenant_id, feature_key)
    WHERE revoked_at IS NULL;

-- =========================
-- TRIGGERS
-- =========================
CREATE TRIGGER update_features_updated_at
    BEFORE UPDATE ON public.features
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_overrides_updated_at
    BEFORE UPDATE ON public.tenant_feature_overrides
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- =========================
-- ROLLBACK
-- =========================
/*
BEGIN;
DROP TRIGGER IF EXISTS update_overrides_updated_at ON public.tenant_feature_overrides;
DROP TRIGGER IF EXISTS update_features_updated_at ON public.features;
DROP INDEX IF EXISTS idx_overrides_feature_key;
DROP INDEX IF EXISTS idx_overrides_granted_by;
DROP INDEX IF EXISTS idx_overrides_expires_at;
DROP INDEX IF EXISTS idx_overrides_tenant_id;
DROP TABLE IF EXISTS public.tenant_feature_overrides;
DROP TABLE IF EXISTS public.features;
DROP TYPE IF EXISTS feature_data_type;
COMMIT;
*/