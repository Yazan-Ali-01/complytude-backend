BEGIN;

-- =========================
-- Migration 007: Documents Table with RLS
-- =========================
-- Description: Tenant-scoped documents table with Row Level Security for tenant isolation
-- RLS Policies: SELECT and INSERT only (no UPDATE or DELETE)
-- Supports both text-input and file-upload documents
-- =========================

-- =========================
-- ENUM TYPES
-- =========================

CREATE TYPE public.document_source_type AS ENUM ('text_input', 'file_upload', 'generated');
CREATE TYPE public.document_extraction_status AS ENUM ('pending', 'processing', 'completed', 'failed');

-- =========================
-- DOCUMENTS TABLE
-- =========================

CREATE TABLE public.documents (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL,
    title                   VARCHAR(255) NOT NULL,
    content                 TEXT,
    metadata                JSONB DEFAULT '{}',
    created_by              UUID,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- File storage columns
    source_type             public.document_source_type NOT NULL DEFAULT 'text_input',
    s3_key                  VARCHAR(1024),
    s3_bucket               VARCHAR(255),
    original_filename       VARCHAR(512),
    file_size_bytes         BIGINT,
    mime_type               VARCHAR(255),
    extraction_status       public.document_extraction_status,
    extraction_error        TEXT,
    extracted_at            TIMESTAMPTZ,

    -- Template generation columns
    template_id             UUID NULL,
    template_version_id     UUID NULL,
    generation_variables    JSONB NULL,

    -- Soft delete columns
    deleted_at              TIMESTAMPTZ DEFAULT NULL,
    deleted_by              UUID DEFAULT NULL,

    CONSTRAINT fk_documents_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_created_by
        FOREIGN KEY (created_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_deleted_by
        FOREIGN KEY (deleted_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    CONSTRAINT fk_documents_template
        FOREIGN KEY (template_id)
        REFERENCES public.templates(id)
        ON DELETE SET NULL,

    CONSTRAINT fk_documents_template_version
        FOREIGN KEY (template_version_id)
        REFERENCES public.template_versions(id)
        ON DELETE SET NULL,

    CONSTRAINT chk_document_source
        CHECK (
            (source_type = 'text_input' AND content IS NOT NULL) OR
            (source_type = 'file_upload' AND s3_key IS NOT NULL) OR
            (source_type = 'generated' AND s3_key IS NOT NULL)
        ),

    CONSTRAINT chk_generated_document
        CHECK (
            (source_type != 'generated') OR
            (source_type = 'generated' AND template_id IS NOT NULL AND template_version_id IS NOT NULL AND generation_variables IS NOT NULL)
        )
);

COMMENT ON TABLE public.documents IS 'Tenant-scoped documents with RLS-based tenant isolation';
COMMENT ON COLUMN public.documents.tenant_id IS 'Tenant identifier - required for RLS isolation';
COMMENT ON COLUMN public.documents.metadata IS 'Additional document metadata (tags, custom fields, etc.)';
COMMENT ON COLUMN public.documents.deleted_at IS 'Soft-delete timestamp (NULL = active, NOT NULL = deleted)';
COMMENT ON COLUMN public.documents.deleted_by IS 'User who deleted the document (SET NULL on user delete)';
COMMENT ON COLUMN public.documents.template_id IS 'Template used to generate this document (NULL for non-generated docs)';
COMMENT ON COLUMN public.documents.template_version_id IS 'Specific template version used for generation';
COMMENT ON COLUMN public.documents.generation_variables IS 'Variable values supplied during document generation';

-- =========================
-- INDEXES
-- =========================

-- Critical index for RLS performance
CREATE INDEX idx_documents_tenant_id ON public.documents(tenant_id);

-- Additional indexes for common queries
CREATE INDEX idx_documents_created_by ON public.documents(created_by);
CREATE INDEX idx_documents_created_at ON public.documents(created_at DESC);

-- File storage indexes (partial — only for rows where value is set)
CREATE INDEX idx_documents_extraction_status ON public.documents(extraction_status) WHERE extraction_status IS NOT NULL;
CREATE INDEX idx_documents_s3_key ON public.documents(s3_key) WHERE s3_key IS NOT NULL;

-- Template generation indexes (partial — only for generated documents)
CREATE INDEX idx_documents_template_id ON public.documents(template_id) WHERE template_id IS NOT NULL;
CREATE INDEX idx_documents_template_version_id ON public.documents(template_version_id) WHERE template_version_id IS NOT NULL;

-- Composite indexes for tenant-scoped queries
CREATE INDEX idx_documents_tenant_created ON public.documents(tenant_id, created_at DESC);

-- Partial index for active (non-deleted) documents — covers the common query path
CREATE INDEX idx_documents_active_tenant_created ON public.documents(tenant_id, created_at DESC) WHERE deleted_at IS NULL;

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

-- SELECT Policy: Users see their tenant's documents; platform admins see all
CREATE POLICY documents_select
ON public.documents
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY documents_select ON public.documents IS 
    'Tenant isolation for SELECT - users can only see their tenant''s documents; platform admins see all';

-- INSERT Policy: Users create for their tenant; platform admins for any tenant
CREATE POLICY documents_insert
ON public.documents
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY documents_insert ON public.documents IS 
    'Tenant isolation for INSERT - users can only create documents for their own tenant; platform admins for any';

-- UPDATE Policy: Tenant admins update their tenant's documents; platform admins update any
CREATE POLICY documents_update
ON public.documents
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY documents_update ON public.documents IS 
    'Tenant isolation for UPDATE - tenant users can update their own tenant''s documents; platform admins can update any. Used by workers via platform admin context.';

-- DELETE Policy: Tenant users delete their tenant's documents; platform admins delete any
CREATE POLICY documents_delete
ON public.documents
FOR DELETE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

COMMENT ON POLICY documents_delete ON public.documents IS 
    'Tenant isolation for DELETE - tenant users can only delete their own tenant''s documents; platform admins can delete any';

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
DROP INDEX IF EXISTS public.idx_documents_template_version_id;
DROP INDEX IF EXISTS public.idx_documents_template_id;
DROP INDEX IF EXISTS public.idx_documents_s3_key;
DROP INDEX IF EXISTS public.idx_documents_extraction_status;
DROP INDEX IF EXISTS public.idx_documents_tenant_created;
DROP INDEX IF EXISTS public.idx_documents_active_tenant_created;
DROP INDEX IF EXISTS public.idx_documents_created_at;
DROP INDEX IF EXISTS public.idx_documents_created_by;
DROP INDEX IF EXISTS public.idx_documents_tenant_id;

-- Drop table
DROP TABLE IF EXISTS public.documents;

-- Drop enum types
DROP TYPE IF EXISTS public.document_extraction_status;
DROP TYPE IF EXISTS public.document_source_type;

COMMIT;
*/
