BEGIN;

-- =========================
-- Migration 034: which pages of a document were read by OCR
-- =========================
-- Description: ingestion reads a PDF's own text layer locally and sends only the pages without
--              one (scans) to Textract, as a PDF of just those pages. ocr_pages lists them
--              (1-based pages of the uploaded file): stored with the Textract job, so a retry that
--              resumes the job maps its pages back the same way, and kept with the extracted
--              content as the record of what an OCR processor saw. '{}' = no page left the
--              worker; every page for an image upload; NULL = not extracted yet, or extracted
--              before this column (then the whole file went to Textract).
-- =========================

ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS ocr_pages INTEGER[] NULL;

COMMENT ON COLUMN public.documents.ocr_pages IS
    'Pages (1-based) whose text came from OCR (Textract); {} = text layer only; NULL = not extracted yet or before this column';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.documents DROP COLUMN IF EXISTS ocr_pages;
COMMIT;
*/
