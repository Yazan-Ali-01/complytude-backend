BEGIN;

-- =========================
-- Migration 033: ruleset applicability (jurisdictions and document types)
-- =========================
-- Description: an analysis is scoped to the rulesets that apply to the contract, chosen by where
--              it is governed and what kind of contract it is (federal labour law doesn't apply in
--              the DIFC; company regulations don't apply to an employment contract). Codes are
--              validated by the API (ANALYSIS_JURISDICTIONS / ANALYSIS_DOCUMENT_TYPES in
--              libs/queue); an empty array means the ruleset is used only when picked explicitly.
-- =========================

ALTER TABLE public.rulesets
    ADD COLUMN jurisdictions TEXT[] NOT NULL DEFAULT '{}',
    ADD COLUMN document_types TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.rulesets.jurisdictions IS
    'Jurisdiction codes the ruleset applies to (MAINLAND, DMCC, DIFC, ...); empty = explicit selection only';
COMMENT ON COLUMN public.rulesets.document_types IS
    'Document types the ruleset applies to (employment, services, ...); empty = explicit selection only';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.rulesets DROP COLUMN document_types, DROP COLUMN jurisdictions;
COMMIT;
*/
