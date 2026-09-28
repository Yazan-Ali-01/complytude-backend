BEGIN;

-- =========================
-- Migration 026: Remember the Textract job of a document
-- =========================
-- Description: Textract bills per page on StartDocumentAnalysis. The ingestion worker stores the
--              job ID as soon as the job starts, so a retried ingestion (poll timeout, crash,
--              stalled job) resumes polling that job instead of starting and paying for another.
--              Cleared when the job itself failed and a new one is needed.
-- =========================

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS textract_job_id TEXT NULL;

COMMENT ON COLUMN public.documents.textract_job_id IS
  'Textract StartDocumentAnalysis job of this document, reused by retries of its ingestion';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;

ALTER TABLE public.documents DROP COLUMN IF EXISTS textract_job_id;

COMMIT;
*/
