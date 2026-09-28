BEGIN;

-- =========================
-- Migration 027: Search ruleset chunks in Arabic as well as English
-- =========================
-- Description: content_tsv only held English stems, so Arabic regulations and Arabic contracts
--              never matched lexically (BM25). It now holds both the English and the Arabic
--              (snowball) stems of each chunk; the retrieval query searches both.
-- =========================

DROP INDEX IF EXISTS public.idx_ruleset_chunks_content_tsv;
ALTER TABLE public.ruleset_chunks DROP COLUMN content_tsv;
ALTER TABLE public.ruleset_chunks
    ADD COLUMN content_tsv TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', content) || to_tsvector('arabic', content)
    ) STORED;

COMMENT ON COLUMN public.ruleset_chunks.content_tsv IS
  'Generated tsvector (English and Arabic stems) for BM25 full-text search (auto-maintained by PostgreSQL)';

CREATE INDEX idx_ruleset_chunks_content_tsv ON public.ruleset_chunks
    USING gin (content_tsv);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;

DROP INDEX IF EXISTS public.idx_ruleset_chunks_content_tsv;
ALTER TABLE public.ruleset_chunks DROP COLUMN content_tsv;
ALTER TABLE public.ruleset_chunks
    ADD COLUMN content_tsv TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED;
CREATE INDEX idx_ruleset_chunks_content_tsv ON public.ruleset_chunks USING gin (content_tsv);

COMMIT;
*/
