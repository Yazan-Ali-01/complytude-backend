BEGIN;

-- =========================
-- Migration 040: a ruleset version's ingestion and legal review
-- =========================
-- Description: a version was usable as soon as it was created, before its chunks existed or
--              anyone had checked its text. Each version now records:
--              - ingestion: pending until the worker stores its chunks (ingested, with the
--                count) or gives up (failed, with the error);
--              - review (D-9): draft until a reviewer (the law firm) and a review date are
--                recorded.
--              A version is created inactive and activated only once ingested, and in production
--              only once reviewed (enforced by the API); so a new ruleset has no current version
--              until then. Existing versions with chunks are backfilled as ingested.
-- =========================

ALTER TABLE public.ruleset_versions
    ADD COLUMN ingestion_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN chunk_count INTEGER NULL,
    ADD COLUMN ingestion_error TEXT NULL,
    ADD COLUMN ingested_at TIMESTAMPTZ NULL,
    ADD COLUMN review_status VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN reviewed_by VARCHAR(255) NULL,
    ADD COLUMN reviewed_at DATE NULL,
    ADD COLUMN review_notes TEXT NULL;

ALTER TABLE public.ruleset_versions
    ADD CONSTRAINT chk_ruleset_versions_ingestion_status
        CHECK (ingestion_status IN ('pending', 'ingested', 'failed')),
    ADD CONSTRAINT chk_ruleset_versions_review_status
        CHECK (review_status IN ('draft', 'reviewed')),
    ADD CONSTRAINT chk_ruleset_versions_reviewed_by_whom_and_when
        CHECK (review_status = 'draft' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL));

UPDATE public.ruleset_versions v
SET ingestion_status = 'ingested',
    chunk_count = c.chunks,
    ingested_at = now()
FROM (
    SELECT ruleset_version_id, count(*)::int AS chunks
    FROM public.ruleset_chunks
    GROUP BY ruleset_version_id
) c
WHERE c.ruleset_version_id = v.id;

-- A new ruleset has no active version until its first version is ingested and activated
ALTER TABLE public.rulesets ALTER COLUMN current_version DROP NOT NULL;
ALTER TABLE public.rulesets ALTER COLUMN current_version DROP DEFAULT;

COMMENT ON COLUMN public.ruleset_versions.ingestion_status IS
    'pending until the ingestion worker stores the chunks (ingested) or gives up (failed); only an ingested version can be activated';
COMMENT ON COLUMN public.ruleset_versions.review_status IS
    'draft until a legal review is recorded (reviewed_by, reviewed_at); production activates reviewed versions only';
COMMENT ON COLUMN public.ruleset_versions.reviewed_by IS
    'Who reviewed the text (e.g. the law firm and reviewer), as recorded by a platform admin';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.ruleset_versions
    DROP CONSTRAINT IF EXISTS chk_ruleset_versions_reviewed_by_whom_and_when,
    DROP CONSTRAINT IF EXISTS chk_ruleset_versions_review_status,
    DROP CONSTRAINT IF EXISTS chk_ruleset_versions_ingestion_status,
    DROP COLUMN IF EXISTS review_notes,
    DROP COLUMN IF EXISTS reviewed_at,
    DROP COLUMN IF EXISTS reviewed_by,
    DROP COLUMN IF EXISTS review_status,
    DROP COLUMN IF EXISTS ingested_at,
    DROP COLUMN IF EXISTS ingestion_error,
    DROP COLUMN IF EXISTS chunk_count,
    DROP COLUMN IF EXISTS ingestion_status;
UPDATE public.rulesets SET current_version = '1.0.0' WHERE current_version IS NULL;
ALTER TABLE public.rulesets ALTER COLUMN current_version SET DEFAULT '1.0.0';
ALTER TABLE public.rulesets ALTER COLUMN current_version SET NOT NULL;
COMMIT;
*/
