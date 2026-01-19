BEGIN;

-- =========================
-- Migration 007: Documents Table with RLS
-- =========================
-- Description: Tenant-scoped documents table with Row Level Security for tenant isolation
-- RLS Policies: SELECT and INSERT only (no UPDATE or DELETE)
-- =========================

-- =========================
-- DOCUMENTS TABLE
-- =========================

CREATE TABLE public.documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    content                 TEXT,
    metadata                JSONB DEFAULT '{}',
    template_id             UUID,
    template_version_id     UUID,
    generation_metadata     JSONB DEFAULT '{}',
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_documents_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_template
        FOREIGN KEY (template_id)
        REFERENCES public.templates(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_template_version
        FOREIGN KEY (template_version_id)
        REFERENCES public.template_versions(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);

COMMENT ON TABLE public.documents IS 'Tenant-scoped documents with RLS-based tenant isolation';
COMMENT ON COLUMN public.documents.tenant_id IS 'Tenant identifier - required for RLS isolation';
COMMENT ON COLUMN public.documents.template_id IS 'Reference to template used for generation';
COMMENT ON COLUMN public.documents.template_version_id IS 'Specific version of template used for traceability';
COMMENT ON COLUMN public.documents.generation_metadata IS 'Metadata about document generation process (AI model, parameters, etc.)';
COMMENT ON COLUMN public.documents.metadata IS 'Additional document metadata (tags, custom fields, etc.)';

-- =========================
-- INDEXES
-- =========================

-- Critical index for RLS performance
CREATE INDEX idx_documents_tenant_id ON public.documents(tenant_id);

-- Additional indexes for common queries
CREATE INDEX idx_documents_template_id ON public.documents(template_id);
CREATE INDEX idx_documents_template_version_id ON public.documents(template_version_id);
CREATE INDEX idx_documents_created_by ON public.documents(created_by);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- Composite indexes for tenant-scoped queries
CREATE INDEX idx_documents_tenant_created ON public.documents(tenant_id, created_at DESC);
CREATE INDEX idx_documents_tenant_template ON public.documents(tenant_id, template_id);

-- =========================
-- TRIGGERS
-- =========================

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- =========================
-- ROW LEVEL SECURITY
-- =========================

-- Enable RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;

-- SELECT Policy: Users can only see documents belonging to their tenant
CREATE POLICY documents_select
ON public.documents
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null()
);

COMMENT ON POLICY documents_select ON public.documents IS 
    'Tenant isolation for SELECT - users can only see their tenant''s documents';

-- INSERT Policy: Users can only create documents for their tenant
CREATE POLICY documents_insert
ON public.documents
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null()
);

COMMENT ON POLICY documents_insert ON public.documents IS 
    'Tenant isolation for INSERT - users can only create documents for their own tenant';

-- =========================
-- VALIDATION FUNCTION
-- =========================

-- Function to validate tenant_id is set before insert/update
CREATE OR REPLACE FUNCTION public.validate_document_tenant_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.tenant_id IS NULL THEN
        RAISE EXCEPTION 'tenant_id cannot be null';
    END IF;
    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.validate_document_tenant_id IS 'Validation trigger to ensure tenant_id is always set on documents';

CREATE TRIGGER validate_documents_tenant_id
    BEFORE INSERT OR UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_document_tenant_id();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS validate_documents_tenant_id ON public.documents;
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;

-- Drop function
DROP FUNCTION IF EXISTS public.validate_document_tenant_id();

-- Drop policies
DROP POLICY IF EXISTS documents_insert ON public.documents;
DROP POLICY IF EXISTS documents_select ON public.documents;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_documents_tenant_template;
DROP INDEX IF EXISTS public.idx_documents_tenant_created;
DROP INDEX IF EXISTS public.idx_documents_created_at;
DROP INDEX IF EXISTS public.idx_documents_created_by;
DROP INDEX IF EXISTS public.idx_documents_template_version_id;
DROP INDEX IF EXISTS public.idx_documents_template_id;
DROP INDEX IF EXISTS public.idx_documents_tenant_id;

-- Drop table
DROP TABLE IF EXISTS public.documents;

COMMIT;
*/
