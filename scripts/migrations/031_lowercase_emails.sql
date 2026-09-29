BEGIN;

-- =========================
-- Migration 031: email addresses are stored lower-case
-- =========================
-- Description: users.email was unique as typed, so Alice@corp.com and alice@corp.com could be two
--              accounts, and a user who signed up with capitals couldn't log in typing lower
--              case. The API now trims and lower-cases every email it receives; this migration
--              brings existing rows in line and makes the database enforce it:
--              - users: two rows differing only in case or spaces stop the migration (they are
--                separate accounts, and merging them is a decision for a person); otherwise every
--                email is lower-cased, a CHECK keeps it that way and a unique index on
--                lower(email) backs it up.
--              - invitations: lower-cased too; if that makes two pending invitations to one
--                tenant collide, the older one is expired.
-- =========================

DO $$
DECLARE
    duplicates TEXT;
BEGIN
    SELECT string_agg(address, ', ')
      INTO duplicates
      FROM (
        SELECT lower(btrim(email)) AS address
          FROM public.users
         GROUP BY 1
        HAVING count(*) > 1
      ) AS d;
    IF duplicates IS NOT NULL THEN
        RAISE EXCEPTION 'users share an email address that differs only in case or spaces: %. Merge or rename those accounts, then run the migration again.', duplicates;
    END IF;
END $$;

UPDATE public.users
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));

ALTER TABLE public.users
    ADD CONSTRAINT users_email_lowercase CHECK (email = lower(btrim(email)));

CREATE UNIQUE INDEX users_email_lower_key ON public.users (lower(email));

UPDATE public.invitations AS older
   SET status = 'EXPIRED'
 WHERE older.status = 'PENDING'
   AND EXISTS (
        SELECT 1
          FROM public.invitations AS newer
         WHERE newer.status = 'PENDING'
           AND newer.tenant_id = older.tenant_id
           AND lower(btrim(newer.email)) = lower(btrim(older.email))
           AND (newer.created_at, newer.id) > (older.created_at, older.id)
   );

UPDATE public.invitations
   SET email = lower(btrim(email))
 WHERE email <> lower(btrim(email));

ALTER TABLE public.invitations
    ADD CONSTRAINT invitations_email_lowercase CHECK (email = lower(btrim(email)));

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
ALTER TABLE public.invitations DROP CONSTRAINT IF EXISTS invitations_email_lowercase;
DROP INDEX IF EXISTS public.users_email_lower_key;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_email_lowercase;
COMMIT;
-- The lower-casing itself is not undone.
*/
