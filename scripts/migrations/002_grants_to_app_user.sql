BEGIN;

-- =========================
-- Migration 002: Grant Privileges to app_user Role
-- =========================
-- Description: Grant necessary permissions to app_user role for application access
-- Note: This assumes app_user role was created via scripts/setup-app-user-role.sql
-- The app connects using a login role that inherits from app_user
-- =========================

-- Lock down public schema (if not already done)
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO app_user;

-- =========================
-- Explicit Table Grants
-- =========================

-- Core tables
-- Note: DELETE is NOT granted on tenants and users (soft-delete pattern via is_active flag)
GRANT SELECT, INSERT, UPDATE ON public.tenants TO app_user;
GRANT SELECT, INSERT, UPDATE ON public.users TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_tenants TO app_user;

-- Auth artifact tables
-- Note: DELETE is granted for cleanup_expired_tokens() function
GRANT SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_verifications TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.password_resets TO app_user;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.invitations TO app_user;

-- =========================
-- Sequence & Function Grants
-- =========================

-- Grant sequence usage (for auto-increment/serial columns if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;

-- Grant execute on functions
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- Default privileges only for sequences and functions (not tables)
-- This ensures future sequences and functions are automatically accessible
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Revoke default privileges
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE USAGE, SELECT ON SEQUENCES FROM app_user;

-- Revoke function and sequence grants
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM app_user;
REVOKE USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public FROM app_user;

-- Revoke table grants
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.invitations FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.password_resets FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.email_verifications FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.refresh_tokens FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.user_tenants FROM app_user;
REVOKE SELECT, INSERT, UPDATE ON public.users FROM app_user;
REVOKE SELECT, INSERT, UPDATE ON public.tenants FROM app_user;

-- Revoke schema access
REVOKE USAGE ON SCHEMA public FROM app_user;
GRANT ALL ON SCHEMA public TO PUBLIC;

COMMIT;
*/
