BEGIN;

-- =========================
-- Migration 039: the model behind each ruleset chunk's embedding
-- =========================
-- Description: vectors from different embedding models can't be compared, even at the same
--              dimension count. The UAE data-residency route offers only text-embedding-3-large
--              (at 1536 dimensions, so the vector(1536) column and its HNSW index stay), while
--              every chunk so far was embedded with text-embedding-3-small. Each chunk now records
--              its model, and retrieval only compares a document's vectors with chunks of the
--              same model: after switching, re-embed the active versions
--              (pnpm rulesets:reingest). Existing rows are text-embedding-3-small; the default is
--              dropped so every insert names its model.
-- =========================

ALTER TABLE public.ruleset_chunks
    ADD COLUMN embedding_model VARCHAR(100) NOT NULL DEFAULT 'text-embedding-3-small';
ALTER TABLE public.ruleset_chunks ALTER COLUMN embedding_model DROP DEFAULT;

COMMENT ON COLUMN public.ruleset_chunks.embedding_model IS
    'OpenAI embedding model that produced this chunk''s vector; retrieval compares only vectors of the same model';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.ruleset_chunks DROP COLUMN IF EXISTS embedding_model;
COMMIT;
*/
