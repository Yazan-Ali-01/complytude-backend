BEGIN;

-- =========================
-- Migration 013: Vector Storage and Analysis Tables
-- =========================
-- Description: Tables for RAG compliance analysis pipeline - ruleset chunks with embeddings
--              and analysis job lifecycle tracking. Uses pgvector (vector extension).
-- ruleset_chunks: Global table (no RLS), stores embedded clause chunks for similarity search
-- analysis_jobs: Tenant-scoped table (RLS), tracks compliance analysis job lifecycle
-- Vector dimension 1536: OpenAI text-embedding-3-small
-- =========================

-- =========================
-- PGVECTOR EXTENSION
-- =========================
-- Ensure vector type exists (postgres-init.sh enables it on fresh DB; this covers existing DBs)
CREATE EXTENSION IF NOT EXISTS vector;

-- =========================
-- ENUMS
-- =========================

CREATE TYPE analysis_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');

COMMENT ON TYPE analysis_job_status IS 'Lifecycle status for compliance analysis jobs';

-- =========================
-- RULESET_CHUNKS TABLE (Global, No RLS)
-- =========================

CREATE TABLE public.ruleset_chunks (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ruleset_id         UUID NOT NULL,
    ruleset_version_id UUID NOT NULL,
    chunk_index        INTEGER NOT NULL,
    content            TEXT NOT NULL,
    embedding          vector(1536) NOT NULL,
    metadata           JSONB DEFAULT '{}',
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_ruleset_chunks_ruleset
        FOREIGN KEY (ruleset_id)
        REFERENCES public.rulesets(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ruleset_chunks_ruleset_version
        FOREIGN KEY (ruleset_version_id)
        REFERENCES public.ruleset_versions(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT uq_ruleset_chunks_version_index
        UNIQUE (ruleset_version_id, chunk_index)
);

COMMENT ON TABLE public.ruleset_chunks IS 'Embedded ruleset clause chunks for vector similarity search (global, no RLS)';
COMMENT ON COLUMN public.ruleset_chunks.chunk_index IS 'Order of chunk within the ruleset version';
COMMENT ON COLUMN public.ruleset_chunks.embedding IS 'OpenAI text-embedding-3-small vector (1536 dimensions)';
COMMENT ON COLUMN public.ruleset_chunks.metadata IS 'Extra info (token count, source clause index, etc.)';

-- =========================
-- RULESET_CHUNKS INDEXES
-- =========================

CREATE INDEX idx_ruleset_chunks_ruleset_id ON public.ruleset_chunks(ruleset_id);
CREATE INDEX idx_ruleset_chunks_ruleset_version_id ON public.ruleset_chunks(ruleset_version_id);
CREATE INDEX idx_ruleset_chunks_ruleset_version ON public.ruleset_chunks(ruleset_id, ruleset_version_id);

-- HNSW index for fast cosine similarity search
CREATE INDEX idx_ruleset_chunks_embedding_hnsw ON public.ruleset_chunks
    USING hnsw (embedding vector_cosine_ops);

-- =========================
-- ANALYSIS_JOBS TABLE (Tenant-Scoped, RLS in later migration)
-- =========================

CREATE TABLE public.analysis_jobs (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL,
    document_id        UUID NOT NULL,
    ruleset_id         UUID,
    ruleset_version_id UUID,
    status             analysis_job_status NOT NULL DEFAULT 'queued',
    result             JSONB DEFAULT '{}',
    error              TEXT,
    started_at         TIMESTAMPTZ,
    completed_at       TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_analysis_jobs_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_analysis_jobs_document
        FOREIGN KEY (document_id)
        REFERENCES public.documents(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_analysis_jobs_ruleset
        FOREIGN KEY (ruleset_id)
        REFERENCES public.rulesets(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_analysis_jobs_ruleset_version
        FOREIGN KEY (ruleset_version_id)
        REFERENCES public.ruleset_versions(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.analysis_jobs IS 'Compliance analysis job lifecycle (tenant-scoped, RLS)';
COMMENT ON COLUMN public.analysis_jobs.document_id IS 'Document being analyzed';
COMMENT ON COLUMN public.analysis_jobs.ruleset_id IS 'Ruleset used for analysis (traceability, SET NULL on delete)';
COMMENT ON COLUMN public.analysis_jobs.ruleset_version_id IS 'Ruleset version used for analysis (traceability, SET NULL on delete)';
COMMENT ON COLUMN public.analysis_jobs.result IS 'Analysis output (matches, violations, recommendations)';
COMMENT ON COLUMN public.analysis_jobs.error IS 'Error message if status is failed';

-- =========================
-- ANALYSIS_JOBS INDEXES
-- =========================

CREATE INDEX idx_analysis_jobs_tenant_id ON public.analysis_jobs(tenant_id);
CREATE INDEX idx_analysis_jobs_document_id ON public.analysis_jobs(document_id);
CREATE INDEX idx_analysis_jobs_status ON public.analysis_jobs(status);
CREATE INDEX idx_analysis_jobs_tenant_status ON public.analysis_jobs(tenant_id, status);
CREATE INDEX idx_analysis_jobs_tenant_created ON public.analysis_jobs(tenant_id, created_at DESC);

-- =========================
-- TRIGGERS
-- =========================

CREATE TRIGGER update_analysis_jobs_updated_at
    BEFORE UPDATE ON public.analysis_jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS update_analysis_jobs_updated_at ON public.analysis_jobs;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_analysis_jobs_tenant_created;
DROP INDEX IF EXISTS public.idx_analysis_jobs_tenant_status;
DROP INDEX IF EXISTS public.idx_analysis_jobs_status;
DROP INDEX IF EXISTS public.idx_analysis_jobs_document_id;
DROP INDEX IF EXISTS public.idx_analysis_jobs_tenant_id;

DROP INDEX IF EXISTS public.idx_ruleset_chunks_embedding_hnsw;
DROP INDEX IF EXISTS public.idx_ruleset_chunks_ruleset_version;
DROP INDEX IF EXISTS public.idx_ruleset_chunks_ruleset_version_id;
DROP INDEX IF EXISTS public.idx_ruleset_chunks_ruleset_id;

-- Drop tables
DROP TABLE IF EXISTS public.analysis_jobs;
DROP TABLE IF EXISTS public.ruleset_chunks;

-- Drop enum
DROP TYPE IF EXISTS analysis_job_status;

COMMIT;
*/
