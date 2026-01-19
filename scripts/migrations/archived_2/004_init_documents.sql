-- ============================================================================
-- Migration 004: Documents Table (Pure RLS)
-- ============================================================================
-- Description: Consolidated documents table in public schema with RLS
-- Dependencies: 001_init_multi_tenancy.sql, 002_init_auth.sql, 003_init_templates.sql
-- ============================================================================

-- ============================================================================
-- 1. DOCUMENTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.documents (
    id VARCHAR(255) PRIMARY KEY,
    tenant_id VARCHAR(255) NOT NULL,
    title VARCHAR(255) NOT NULL,
    content TEXT,
    metadata JSONB DEFAULT '{}',
    template_key VARCHAR(255),
    template_version VARCHAR(50),
    generation_metadata JSONB,
    created_by VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_documents_tenant FOREIGN KEY (tenant_id) 
        REFERENCES public.tenants(tenant_id) ON DELETE CASCADE,
    CONSTRAINT fk_documents_created_by FOREIGN KEY (created_by) 
        REFERENCES public.users(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.documents IS 'Tenant documents - consolidated in public schema with RLS isolation';
COMMENT ON COLUMN public.documents.tenant_id IS 'Tenant identifier - required for RLS isolation';
COMMENT ON COLUMN public.documents.template_key IS 'Reference to template key used for generation';
COMMENT ON COLUMN public.documents.template_version IS 'Version of template used';
COMMENT ON COLUMN public.documents.generation_metadata IS 'Metadata about document generation process';
COMMENT ON COLUMN public.documents.metadata IS 'Additional document metadata';

-- ============================================================================
-- 2. INDEXES
-- ============================================================================

-- Critical index for RLS performance
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON public.documents(tenant_id);

-- Additional indexes for common queries
CREATE INDEX IF NOT EXISTS idx_documents_template_key ON public.documents(template_key);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- Composite index for tenant-scoped queries
CREATE INDEX IF NOT EXISTS idx_documents_tenant_created 
    ON public.documents(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_documents_tenant_template 
    ON public.documents(tenant_id, template_key);

-- ============================================================================
-- 3. ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Enable RLS on documents table
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if exists
DROP POLICY IF EXISTS documents_tenant_isolation_policy ON public.documents;

-- RLS Policy: Documents are isolated by tenant_id
-- Users can only access documents belonging to their tenant
CREATE POLICY documents_tenant_isolation_policy ON public.documents
    FOR ALL
    USING (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    )
    WITH CHECK (
        tenant_id = current_setting('app.current_tenant_id', true)
        OR current_setting('app.bypass_rls', true) = 'true'
    );

COMMENT ON POLICY documents_tenant_isolation_policy ON public.documents IS 
    'Isolates documents by tenant - users can only access their tenant''s documents';

-- ============================================================================
-- 4. TRIGGERS
-- ============================================================================

CREATE TRIGGER update_documents_updated_at
    BEFORE UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================================
-- 5. PERMISSIONS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO CURRENT_USER;

-- ============================================================================
-- 6. VALIDATION FUNCTION (Optional)
-- ============================================================================

-- Function to validate tenant_id is set before insert/update
CREATE OR REPLACE FUNCTION validate_document_tenant_id()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.tenant_id IS NULL OR NEW.tenant_id = '' THEN
        RAISE EXCEPTION 'tenant_id cannot be null or empty';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_documents_tenant_id
    BEFORE INSERT OR UPDATE ON public.documents
    FOR EACH ROW
    EXECUTE FUNCTION validate_document_tenant_id();

-- ============================================================================
-- SUCCESS
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 004: Documents table initialized';
    RAISE NOTICE '   - Created public.documents table with tenant_id';
    RAISE NOTICE '   - Configured RLS policy for tenant isolation';
    RAISE NOTICE '   - Created performance indexes including tenant_id';
    RAISE NOTICE '   - All documents now consolidated in public schema';
    RAISE NOTICE '';
    RAISE NOTICE 'ℹ️  Migration to Pure RLS complete!';
    RAISE NOTICE '   No more per-tenant schemas - all isolation via RLS';
END $$;
