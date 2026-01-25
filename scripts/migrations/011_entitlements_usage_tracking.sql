BEGIN;

-- =========================
-- Migration 011: Usage Tracking Tables
-- =========================
-- Description: Creates usage tracking tables for metered features per billing period with audit log
-- =========================

-- =========================
-- TENANT USAGE TABLE (Per Period)
-- =========================
CREATE TABLE public.tenant_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    feature_key     VARCHAR(100) NOT NULL,
    period_start    DATE NOT NULL,
    period_end      DATE NOT NULL,
    usage_count     INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_usage_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_feature
        FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE RESTRICT,
    CONSTRAINT uq_usage_period
        UNIQUE (tenant_id, feature_key, period_start),
    CONSTRAINT chk_period_valid
        CHECK (period_end > period_start)
);

COMMENT ON TABLE public.tenant_usage IS 'Usage tracking for metered features per billing period';
COMMENT ON COLUMN public.tenant_usage.period_start IS 'First day of the billing period';
COMMENT ON COLUMN public.tenant_usage.period_end IS 'Last day of the billing period (exclusive)';
COMMENT ON COLUMN public.tenant_usage.usage_count IS 'Number of times feature was used in this period';

-- =========================
-- USAGE EVENTS TABLE (Audit Log)
-- =========================
CREATE TABLE public.tenant_usage_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL,
    feature_key     VARCHAR(100) NOT NULL,
    user_id         UUID,
    event_type      VARCHAR(50) NOT NULL,
    delta           INTEGER NOT NULL DEFAULT 1,
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_usage_event_tenant
        FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT fk_usage_event_feature
        FOREIGN KEY (feature_key) REFERENCES public.features(key) ON DELETE RESTRICT,
    CONSTRAINT fk_usage_event_user
        FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.tenant_usage_events IS 'Detailed log of all usage events for auditing';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_usage_tenant_period ON public.tenant_usage(tenant_id, period_start DESC);
CREATE INDEX idx_usage_feature_period ON public.tenant_usage(feature_key, period_start DESC);
CREATE INDEX idx_usage_events_tenant ON public.tenant_usage_events(tenant_id, created_at DESC);
CREATE INDEX idx_usage_events_user ON public.tenant_usage_events(user_id) WHERE user_id IS NOT NULL;

-- =========================
-- TRIGGERS
-- =========================
CREATE TRIGGER update_tenant_usage_updated_at
    BEFORE UPDATE ON public.tenant_usage
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- =========================
-- ROLLBACK
-- =========================
/*
BEGIN;
DROP TRIGGER IF EXISTS update_tenant_usage_updated_at ON public.tenant_usage;
DROP INDEX IF EXISTS idx_usage_events_user;
DROP INDEX IF EXISTS idx_usage_events_tenant;
DROP INDEX IF EXISTS idx_usage_feature_period;
DROP INDEX IF EXISTS idx_usage_tenant_period;
DROP TABLE IF EXISTS public.tenant_usage_events;
DROP TABLE IF EXISTS public.tenant_usage;
COMMIT;
*/