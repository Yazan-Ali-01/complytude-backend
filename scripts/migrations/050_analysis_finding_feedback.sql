BEGIN;

-- =========================
-- Migration 050: users' feedback on analysis findings
-- =========================
-- Description: a user can accept or dismiss each finding of a completed analysis, with an optional
--              reason. One row per finding (a later decision replaces the earlier one), stored with
--              the result's model and prompt version and the finding's ruleset and clause chunk, so
--              dismissal rates can be compared across prompt versions and rulesets and reviewed
--              cases promoted into the evaluation set. Tenant-scoped with RLS.
-- =========================

CREATE TABLE public.analysis_finding_feedback (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    analysis_job_id UUID NOT NULL REFERENCES public.analysis_jobs(id) ON DELETE CASCADE,
    finding_id      TEXT NOT NULL,
    decision        VARCHAR(20) NOT NULL CHECK (decision IN ('accepted', 'dismissed')),
    reason          TEXT CHECK (char_length(reason) <= 1000),
    model           VARCHAR(100),
    prompt_version  INTEGER,
    ruleset_key     VARCHAR(255),
    chunk_id        TEXT,
    decided_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
    decided_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_analysis_finding_feedback UNIQUE (analysis_job_id, finding_id)
);

COMMENT ON TABLE public.analysis_finding_feedback IS 'A user''s accept or dismiss decision on one analysis finding, with the result''s provenance';
COMMENT ON COLUMN public.analysis_finding_feedback.finding_id IS 'The finding''s id in analysis_jobs.result.findings';
COMMENT ON COLUMN public.analysis_finding_feedback.reason IS 'Why (optional); cleared when the document is erased';
COMMENT ON COLUMN public.analysis_finding_feedback.prompt_version IS 'result.provenance.promptVersion of the analysis';

CREATE INDEX idx_analysis_finding_feedback_tenant ON public.analysis_finding_feedback (tenant_id);
CREATE INDEX idx_analysis_finding_feedback_prompt ON public.analysis_finding_feedback (prompt_version, ruleset_key);

ALTER TABLE public.analysis_finding_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_finding_feedback FORCE ROW LEVEL SECURITY;

CREATE POLICY analysis_finding_feedback_select
ON public.analysis_finding_feedback
FOR SELECT
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

CREATE POLICY analysis_finding_feedback_insert
ON public.analysis_finding_feedback
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

CREATE POLICY analysis_finding_feedback_update
ON public.analysis_finding_feedback
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

GRANT SELECT, INSERT, UPDATE ON public.analysis_finding_feedback TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP TABLE IF EXISTS public.analysis_finding_feedback;
COMMIT;
*/
