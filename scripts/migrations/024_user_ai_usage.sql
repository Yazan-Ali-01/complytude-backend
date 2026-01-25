-- =========================
-- Migration 024: User AI Usage Table
-- =========================
-- Description: Creates table for tracking AI generation usage per user per day
--              Used by AiRateLimitGuard to enforce member daily limit (5/day)
-- =========================

BEGIN;

-- =========================
-- USER AI USAGE TABLE
-- =========================
CREATE TABLE public.user_ai_usage (
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    date DATE NOT NULL,
    usage_count INTEGER NOT NULL DEFAULT 0,
    metadata JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, tenant_id, date),
    CONSTRAINT fk_ai_usage_user FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_ai_usage_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT chk_usage_count_positive CHECK (usage_count >= 0)
);

COMMENT ON TABLE public.user_ai_usage IS 'Tracks daily AI generation usage per user for rate limiting';
COMMENT ON COLUMN public.user_ai_usage.date IS 'Date of usage (UTC midnight)';
COMMENT ON COLUMN public.user_ai_usage.usage_count IS 'Number of AI generations on this date';
COMMENT ON COLUMN public.user_ai_usage.metadata IS 'Optional metadata about usage (model used, etc.)';

-- =========================
-- INDEXES
-- =========================
-- For querying tenant-wide usage by date
CREATE INDEX idx_user_ai_usage_tenant_date ON public.user_ai_usage(tenant_id, date DESC);

-- For querying user usage history
CREATE INDEX idx_user_ai_usage_user_date ON public.user_ai_usage(user_id, date DESC);

-- =========================
-- TRIGGER FOR updated_at
-- =========================
CREATE TRIGGER trg_user_ai_usage_updated_at
    BEFORE UPDATE ON public.user_ai_usage
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- GRANTS
-- =========================
GRANT SELECT, INSERT, UPDATE ON public.user_ai_usage TO complytude_app;
GRANT ALL ON public.user_ai_usage TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP TRIGGER IF EXISTS trg_user_ai_usage_updated_at ON public.user_ai_usage;
DROP INDEX IF EXISTS idx_user_ai_usage_user_date;
DROP INDEX IF EXISTS idx_user_ai_usage_tenant_date;
DROP TABLE IF EXISTS public.user_ai_usage;
COMMIT;
*/
