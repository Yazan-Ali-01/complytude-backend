BEGIN;

-- =========================
-- Migration 047: self-service account deletion and anonymization
-- =========================
-- Description: a user can delete their own account (decision D-7). Deleting closes it at once: the
--              login email is replaced by a tombstone (the address is kept in deleted_email), the
--              password hash and SSO ids are cleared and memberships removed, so no sign-in path
--              reaches it and the address can sign up again. 30 days later the retention sweep
--              anonymizes it: names and deleted_email are cleared. The row and its id stay, so
--              past actions (documents, audit rows) remain attributed to an anonymous id.
-- =========================

ALTER TABLE public.users
    ADD COLUMN deleted_at TIMESTAMPTZ,
    ADD COLUMN deleted_email VARCHAR(255),
    ADD COLUMN anonymized_at TIMESTAMPTZ;

COMMENT ON COLUMN public.users.deleted_at IS 'When the user deleted their account (NULL = active). The account is closed at once';
COMMENT ON COLUMN public.users.deleted_email IS 'The email of a deleted account, kept until it is anonymized (email holds a tombstone meanwhile)';
COMMENT ON COLUMN public.users.anonymized_at IS 'When a deleted account''s names and email were erased (30 days after deletion)';

CREATE INDEX idx_users_pending_anonymization ON public.users (deleted_at)
    WHERE deleted_at IS NOT NULL AND anonymized_at IS NULL;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP INDEX IF EXISTS public.idx_users_pending_anonymization;
ALTER TABLE public.users
    DROP COLUMN IF EXISTS anonymized_at,
    DROP COLUMN IF EXISTS deleted_email,
    DROP COLUMN IF EXISTS deleted_at;
COMMIT;
*/
