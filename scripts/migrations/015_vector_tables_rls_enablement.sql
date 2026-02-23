BEGIN;

-- =========================
-- Migration 015: Enable Row Level Security on Vector Tables
-- =========================
-- Description: Enable RLS on tenant-scoped analysis_jobs table for tenant isolation
-- Note: FORCE ROW LEVEL SECURITY ensures RLS applies even to table owners
-- ruleset_chunks: Global table (no RLS), same as rulesets
-- =========================

-- =========================
-- Enable RLS on analysis_jobs (Tenant-Scoped)
-- =========================

ALTER TABLE public.analysis_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_jobs FORCE ROW LEVEL SECURITY;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Disable RLS on analysis_jobs
ALTER TABLE public.analysis_jobs DISABLE ROW LEVEL SECURITY;

COMMIT;
*/
