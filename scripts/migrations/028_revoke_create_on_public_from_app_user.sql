BEGIN;

-- =========================
-- Migration 028: The runtime role may not create objects in public
-- =========================
-- Description: setup-app-user-role.sql granted CREATE ON SCHEMA public to app_user (and CI re-ran
--              it on every deploy). The app never creates objects; migrations run as the admin
--              role. An app role that can create functions or tables in the schema its RLS
--              policies depend on could shadow them, so the grant is revoked.
-- =========================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE CREATE ON SCHEMA public FROM app_user;
    END IF;
END $$;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
GRANT CREATE ON SCHEMA public TO app_user;
COMMIT;
*/
