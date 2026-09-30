BEGIN;

-- =========================
-- Migration 037: consent to AI processing, per organization
-- =========================
-- Description: contract analysis sends (masked) contract text to the AI processors listed in
--              docs/SUBPROCESSORS.md, and scanned pages to OCR. An organization agrees to that
--              once, with a checkbox when it is set up or later from its settings, to a numbered
--              version of the disclosure; until it has agreed to the current version, analysis
--              and uploads are refused. One row per organization and version accepted: who
--              accepted it and when. Append-only: the app role may read and insert, never change
--              or delete a row.
-- =========================

CREATE TABLE public.tenant_ai_consents (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id          UUID NOT NULL,
    disclosure_version VARCHAR(32) NOT NULL,
    accepted_by        UUID NULL,
    accepted_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT fk_tenant_ai_consents_tenant
        FOREIGN KEY (tenant_id)
        REFERENCES public.tenants(id)
        ON DELETE CASCADE,
    CONSTRAINT fk_tenant_ai_consents_accepted_by
        FOREIGN KEY (accepted_by)
        REFERENCES public.users(id)
        ON DELETE SET NULL,
    CONSTRAINT uq_tenant_ai_consents_tenant_version
        UNIQUE (tenant_id, disclosure_version)
);

COMMENT ON TABLE public.tenant_ai_consents IS
    'Which version of the AI processing disclosure each organization accepted, by whom and when (append-only, RLS)';
COMMENT ON COLUMN public.tenant_ai_consents.disclosure_version IS
    'AI_DISCLOSURE_VERSION the user saw when accepting';
COMMENT ON COLUMN public.tenant_ai_consents.accepted_by IS
    'User who accepted (a tenant admin); NULL once that user is deleted';

ALTER TABLE public.tenant_ai_consents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_ai_consents FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_ai_consents_select
ON public.tenant_ai_consents
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- A tenant admin accepts for their organization; organization setup runs in platform context
CREATE POLICY tenant_ai_consents_insert
ON public.tenant_ai_consents
FOR INSERT
WITH CHECK (
    (tenant_id = current_tenant_id_or_null() AND is_tenant_admin())
    OR is_platform_admin()
);

GRANT SELECT, INSERT ON public.tenant_ai_consents TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP TABLE IF EXISTS public.tenant_ai_consents;
COMMIT;
*/
