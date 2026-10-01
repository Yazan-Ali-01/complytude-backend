BEGIN;

-- =========================
-- Migration 046: 30-day trash for deleted documents
-- =========================
-- Description: deleting a document now moves it to a trash for 30 days, where it can be listed and
--              restored (decision D-7). After 30 days the daily retention sweep erases it: text,
--              structure, contract variables, analysis results, generation variables and the file.
--              erased_at records when; a row with deleted_at set and erased_at NULL is in the trash.
--              Documents deleted before this migration were erased when deleted (or, before that
--              rule, should have been): they are erased now and marked, so none reappears in the
--              trash. The tables force RLS and the migration has no tenant context, so FORCE is
--              lifted for the table owner while the backfill runs and restored after it.
-- =========================

ALTER TABLE public.documents ADD COLUMN erased_at TIMESTAMPTZ;

COMMENT ON COLUMN public.documents.deleted_at IS 'When the document was deleted (NULL = active). With erased_at NULL it is in the 30-day trash and can be restored';
COMMENT ON COLUMN public.documents.erased_at IS 'When a deleted document''s text, structure, variables, job results and file were erased (30 days after deletion)';

-- The sweep and the trash list read only deleted, not yet erased rows
CREATE INDEX idx_documents_trash ON public.documents (tenant_id, deleted_at DESC)
    WHERE deleted_at IS NOT NULL AND erased_at IS NULL;

ALTER TABLE public.documents NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs NO FORCE ROW LEVEL SECURITY;

WITH erased AS (
    UPDATE public.documents
    SET erased_at = deleted_at,
        content = CASE WHEN source_type = 'text_input' THEN '' END,
        content_structured = NULL,
        generation_variables = CASE WHEN source_type = 'generated' THEN '{}'::jsonb END
    WHERE deleted_at IS NOT NULL
    RETURNING id
), analyses AS (
    UPDATE public.analysis_jobs SET result = NULL
    WHERE document_id IN (SELECT id FROM erased) AND result IS NOT NULL
)
UPDATE public.generation_jobs SET variables = '{}'::jsonb
WHERE document_id IN (SELECT id FROM erased) AND variables <> '{}'::jsonb;

ALTER TABLE public.documents FORCE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE public.generation_jobs FORCE ROW LEVEL SECURITY;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS public.idx_documents_trash;
ALTER TABLE public.documents DROP COLUMN IF EXISTS erased_at;
COMMENT ON COLUMN public.documents.deleted_at IS 'Soft-delete timestamp (NULL = active, NOT NULL = deleted)';
COMMIT;
*/
