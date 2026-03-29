BEGIN;

-- =========================
-- Migration 021: Generation Jobs Table
-- =========================
-- Description: Async document generation job lifecycle tracking.
--              Mirrors the analysis_jobs pattern (migration 013).
--              Tenant-scoped with RLS for tenant isolation.
-- =========================

-- =========================
-- ENUM TYPES
-- =========================

CREATE TYPE public.generation_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
CREATE TYPE public.generation_job_type AS ENUM ('preview', 'generate');

COMMENT ON TYPE public.generation_job_status IS 'Lifecycle status for document generation jobs';
COMMENT ON TYPE public.generation_job_type IS 'preview = watermarked PDF (sync), generate = clean PDF persisted to S3 (async)';

-- =========================
-- GENERATION_JOBS TABLE
-- =========================

CREATE TABLE public.generation_jobs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id           UUID NOT NULL,
    template_id         UUID NOT NULL,
    template_version_id UUID NOT NULL,
    document_id         UUID NULL,
    job_type            public.generation_job_type NOT NULL,
    status              public.generation_job_status NOT NULL DEFAULT 'queued',
    variables           JSONB NOT NULL,
    result              JSONB NULL,
    error               TEXT NULL,
    created_by          UUID NOT NULL,
    started_at          TIMESTAMPTZ NULL,
    completed_at        TIMESTAMPTZ NULL,
    failed_at           TIMESTAMPTZ NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_generation_jobs_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_generation_jobs_template
        FOREIGN KEY (template_id)
        REFERENCES public.templates(id),

    CONSTRAINT fk_generation_jobs_template_version
        FOREIGN KEY (template_version_id)
        REFERENCES public.template_versions(id),

    CONSTRAINT fk_generation_jobs_document
        FOREIGN KEY (document_id)
        REFERENCES public.documents(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_generation_jobs_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE RESTRICT
);

COMMENT ON TABLE public.generation_jobs IS 'Document generation job lifecycle (tenant-scoped, RLS)';
COMMENT ON COLUMN public.generation_jobs.job_type IS 'preview = sync watermarked PDF, generate = async clean PDF persisted to S3';
COMMENT ON COLUMN public.generation_jobs.variables IS 'Merged user + system variables supplied at generation time';
COMMENT ON COLUMN public.generation_jobs.result IS 'Output data when completed (e.g., document_id, signed_url)';
COMMENT ON COLUMN public.generation_jobs.error IS 'Error message when status is failed';
COMMENT ON COLUMN public.generation_jobs.document_id IS 'Created document row (NULL until generate job completes)';

-- =========================
-- INDEXES
-- =========================

CREATE INDEX idx_generation_jobs_tenant ON public.generation_jobs(tenant_id);
CREATE INDEX idx_generation_jobs_status ON public.generation_jobs(status);
CREATE INDEX idx_generation_jobs_created_by ON public.generation_jobs(created_by);
CREATE INDEX idx_generation_jobs_template_id ON public.generation_jobs(template_id);
CREATE INDEX idx_generation_jobs_tenant_status ON public.generation_jobs(tenant_id, status);
CREATE INDEX idx_generation_jobs_tenant_created ON public.generation_jobs(tenant_id, created_at DESC);

-- =========================
-- TRIGGERS
-- =========================

CREATE TRIGGER update_generation_jobs_updated_at
    BEFORE UPDATE ON public.generation_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- ROW LEVEL SECURITY
-- =========================

ALTER TABLE public.generation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY generation_jobs_tenant_isolation ON public.generation_jobs
    USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

COMMENT ON POLICY generation_jobs_tenant_isolation ON public.generation_jobs IS
    'Tenant isolation — users see only their tenant''s jobs; platform admins see all';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

DROP TRIGGER IF EXISTS update_generation_jobs_updated_at ON public.generation_jobs;

DROP INDEX IF EXISTS public.idx_generation_jobs_tenant_created;
DROP INDEX IF EXISTS public.idx_generation_jobs_tenant_status;
DROP INDEX IF EXISTS public.idx_generation_jobs_template_id;
DROP INDEX IF EXISTS public.idx_generation_jobs_created_by;
DROP INDEX IF EXISTS public.idx_generation_jobs_status;
DROP INDEX IF EXISTS public.idx_generation_jobs_tenant;

DROP TABLE IF EXISTS public.generation_jobs;

DROP TYPE IF EXISTS public.generation_job_type;
DROP TYPE IF EXISTS public.generation_job_status;

COMMIT;
*/
