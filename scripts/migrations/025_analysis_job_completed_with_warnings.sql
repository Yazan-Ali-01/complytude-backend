BEGIN;

-- =========================
-- Migration 025: Analysis jobs can complete with warnings
-- =========================
-- Description: An analysis that ran on partial context (document truncated, rerank failed,
--              a requested ruleset with nothing retrieved) or found nothing is stored as
--              'completed_with_warnings', with the reasons in result.warnings, instead of a
--              plain 'completed' that reads as a clean bill of health.
-- =========================

ALTER TYPE analysis_job_status ADD VALUE IF NOT EXISTS 'completed_with_warnings' AFTER 'completed';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- Postgres can't drop an enum value. To roll back: move rows to 'completed', then recreate the
-- type without the value and re-point analysis_jobs.status at it.
/*
BEGIN;

UPDATE public.analysis_jobs SET status = 'completed' WHERE status = 'completed_with_warnings';
ALTER TYPE analysis_job_status RENAME TO analysis_job_status_old;
CREATE TYPE analysis_job_status AS ENUM ('queued', 'processing', 'completed', 'failed');
ALTER TABLE public.analysis_jobs ALTER COLUMN status DROP DEFAULT;
ALTER TABLE public.analysis_jobs
  ALTER COLUMN status TYPE analysis_job_status USING status::text::analysis_job_status;
ALTER TABLE public.analysis_jobs ALTER COLUMN status SET DEFAULT 'queued';
DROP TYPE analysis_job_status_old;

COMMIT;
*/
