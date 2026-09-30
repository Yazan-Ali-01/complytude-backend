BEGIN;

-- =========================
-- Migration 036: OCR by Azure AI Document Intelligence
-- =========================
-- Description: scanned pages are read by Azure AI Document Intelligence (UAE North) instead of
--              Textract, which has no UAE region and reads no Arabic (DOC-003). The column that
--              let a retried ingestion resume its Textract job now holds the Document
--              Intelligence operation (analyze result ID) instead. Stored Textract job IDs mean
--              nothing to the new service and are cleared; for a document that hasn't finished
--              extracting, its pages too, so the next attempt starts a new analysis. A completed
--              document keeps ocr_pages, the record of what OCR saw.
-- =========================

ALTER TABLE public.documents RENAME COLUMN textract_job_id TO ocr_operation_id;

UPDATE public.documents
SET ocr_operation_id = NULL,
    ocr_pages = CASE WHEN extraction_status = 'completed' THEN ocr_pages END
WHERE ocr_operation_id IS NOT NULL;

COMMENT ON COLUMN public.documents.ocr_operation_id IS
    'Document Intelligence analysis (result ID) of this document''s scanned pages, resumed by retries of its ingestion';
COMMENT ON COLUMN public.documents.ocr_pages IS
    'Pages (1-based) whose text came from OCR; {} = text layer only; NULL = not extracted yet or before migration 034';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.documents RENAME COLUMN ocr_operation_id TO textract_job_id;
COMMENT ON COLUMN public.documents.textract_job_id IS
  'Textract StartDocumentAnalysis job of this document, reused by retries of its ingestion';
COMMIT;
*/
