BEGIN;

-- =========================
-- Migration 044: row-level security on invitations
-- =========================
-- Description: invitations (invitee email, role, inviter, token hash) had no RLS, so isolation
--              rested on every query filtering by tenant_id. Now:
--              - the inviting tenant reads and writes its own invitations in its context;
--              - the platform context reads and writes all of them (the daily expiry sweep);
--              - the auth flow (an invitee who is not in the tenant yet) reads only the invitation
--                whose token hash it presents (app.invitation_token_hash) or the invitations sent
--                to its own verified address (app.invitee_email). It writes nothing: accepting
--                and rejecting switch to the inviting tenant's context once the invitee is
--                checked.
-- =========================

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations FORCE ROW LEVEL SECURITY;

CREATE POLICY invitations_select
ON public.invitations
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null()
    OR is_platform_admin()
    OR (
        is_auth_flow()
        AND (
            token_hash = NULLIF(current_setting('app.invitation_token_hash', true), '')
            OR email = NULLIF(current_setting('app.invitee_email', true), '')
        )
    )
);

CREATE POLICY invitations_insert
ON public.invitations
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

CREATE POLICY invitations_update
ON public.invitations
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

CREATE POLICY invitations_delete
ON public.invitations
FOR DELETE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP POLICY IF EXISTS invitations_delete ON public.invitations;
DROP POLICY IF EXISTS invitations_update ON public.invitations;
DROP POLICY IF EXISTS invitations_insert ON public.invitations;
DROP POLICY IF EXISTS invitations_select ON public.invitations;
ALTER TABLE public.invitations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.invitations DISABLE ROW LEVEL SECURITY;
COMMIT;
*/
