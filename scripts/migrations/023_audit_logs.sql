-- =========================
-- Migration 023: Audit Logs Table
-- =========================
-- Description: Creates audit logging table for tracking permission-gated actions
-- =========================

BEGIN;

-- =========================
-- AUDIT LOGS TABLE
-- =========================
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    tenant_id UUID NOT NULL,
    role_name VARCHAR(50) NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id UUID NULL,
    metadata JSONB DEFAULT '{}',
    ai_model_used VARCHAR(50) NULL,
    ip_address INET NULL,
    user_agent TEXT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES public.users(id),
    CONSTRAINT fk_audit_tenant FOREIGN KEY (tenant_id) REFERENCES public.tenants(id)
);

COMMENT ON TABLE public.audit_logs IS 'Audit trail for all permission-gated actions';
COMMENT ON COLUMN public.audit_logs.role_name IS 'User role at time of action (from tenant_role enum)';
COMMENT ON COLUMN public.audit_logs.action IS 'Action performed (e.g., documents:delete)';
COMMENT ON COLUMN public.audit_logs.resource_type IS 'Type of resource affected (e.g., document)';
COMMENT ON COLUMN public.audit_logs.ai_model_used IS 'AI model used for the action (if applicable)';

-- =========================
-- INDEXES
-- =========================
CREATE INDEX idx_audit_logs_tenant_created ON public.audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX idx_audit_logs_tenant_action ON public.audit_logs(tenant_id, action, created_at DESC);

-- =========================
-- GRANTS
-- =========================
GRANT SELECT ON public.audit_logs TO complytude_app;
GRANT ALL ON public.audit_logs TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS idx_audit_logs_tenant_action;
DROP INDEX IF EXISTS idx_audit_logs_action;
DROP INDEX IF EXISTS idx_audit_logs_user;
DROP INDEX IF EXISTS idx_audit_logs_tenant_created;
DROP TABLE IF EXISTS public.audit_logs;
COMMIT;
*/