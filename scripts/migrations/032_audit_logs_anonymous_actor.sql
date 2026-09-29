BEGIN;

-- =========================
-- Migration 032: audit_logs actor_type 'anonymous'
-- =========================
-- Description: events from callers who are not signed in (a failed login, a signup, a password
--              reset request, an SSO callback) were never written, because the only actor
--              types were user, system and api_key. 'anonymous' records them; when the subject
--              account is known its id is in actor_id, otherwise the details say what was tried.
-- =========================

ALTER TABLE public.audit_logs DROP CONSTRAINT check_actor_type;
ALTER TABLE public.audit_logs
    ADD CONSTRAINT check_actor_type CHECK (actor_type IN ('user', 'system', 'api_key', 'anonymous'));

COMMENT ON COLUMN public.audit_logs.actor_type IS
    'Type of actor: user, system, api_key, or anonymous (not signed in; actor_id is the subject account when known)';

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DELETE FROM public.audit_logs WHERE actor_type = 'anonymous';
ALTER TABLE public.audit_logs DROP CONSTRAINT check_actor_type;
ALTER TABLE public.audit_logs
    ADD CONSTRAINT check_actor_type CHECK (actor_type IN ('user', 'system', 'api_key'));
COMMIT;
*/
