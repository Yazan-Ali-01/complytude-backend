-- ============================================================================
-- Setup Application User Role for Production
-- ============================================================================
-- Run by a database administrator before the first migration (bootstrap), not on every deploy.
-- Re-running it is safe: an existing role keeps its password unless -v reset_password=1 is given.
-- 
-- Required environment variables:
--   DB_APP_USER     - Application role name (e.g., app_login)
--   DB_APP_PASSWORD - Password for app_login role
--   DB_NAME         - Target database name
-- 
-- Usage (values unquoted; psql quotes them, so any character in the password is safe):
--   PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -p $DB_PORT -U postgres \
--     -v app_user="$DB_APP_USER" \
--     -v app_password="$DB_APP_PASSWORD" \
--     -v db_name="$DB_NAME" \
--     [-v reset_password=1] \
--     -f scripts/setup-app-user-role.sql
-- ============================================================================

\set QUIET on
\set ON_ERROR_STOP on

-- Verify required variables are set
\if :{?app_user}
\else
  \echo 'ERROR: Variable app_user is not set'
  \echo 'Please set: -v app_user="app_login"'
  \q
\endif

\if :{?app_password}
\else
  \echo 'ERROR: Variable app_password is not set'
  \echo 'Please set: -v app_password="your_password"'
  \q
\endif

\if :{?db_name}
\else
  \echo 'ERROR: Variable db_name is not set'
  \echo 'Please set: -v db_name="your_database"'
  \q
\endif

\set QUIET off

-- ============================================================================
-- 1. Create Roles
-- ============================================================================

-- Set the variables as session settings so they can be used in DO blocks (\gset keeps the
-- password out of the output)
SELECT set_config('app.temp_user', :'app_user', false) AS ignored \gset
SELECT set_config('app.temp_password', :'app_password', false) AS ignored \gset
\if :{?reset_password}
SELECT set_config('app.reset_password', 'on', false) AS ignored \gset
\endif

DO $$
DECLARE
    v_app_user TEXT := current_setting('app.temp_user');
    v_app_password TEXT := current_setting('app.temp_password');
BEGIN
    -- Create the base application role (no login capability)
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        CREATE ROLE app_user NOLOGIN;
        RAISE NOTICE '[OK] Created role: app_user';
    ELSE
        RAISE NOTICE '[INFO] Role app_user already exists';
    END IF;

    -- Create a login role that inherits from app_user
    -- Use the app_user variable (e.g., app_login) from environment
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = v_app_user) THEN
        -- Password is passed as a variable from command line
        EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L IN ROLE app_user', v_app_user, v_app_password);
        RAISE NOTICE '[OK] Created role: %', v_app_user;
    ELSE
        RAISE NOTICE '[INFO] Role % already exists', v_app_user;
        -- Only on request: rotating it under running tasks would break their connections
        IF current_setting('app.reset_password', true) = 'on' THEN
            EXECUTE format('ALTER ROLE %I PASSWORD %L', v_app_user, v_app_password);
            RAISE NOTICE '[OK] Updated password for %', v_app_user;
        END IF;
    END IF;
END $$;

SELECT set_config('app.temp_password', '', false) AS ignored \gset

-- ============================================================================
-- 2. Grant Database Privileges
-- ============================================================================

-- Grant connection to the specific database
-- Note: This uses the db_name variable passed from command line
\connect :db_name

GRANT CONNECT ON DATABASE :db_name TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;
-- No CREATE on public: the runtime role must not create objects in the schema its RLS policies
-- rely on (migrations run as the admin role)

-- Grant sequence usage (needed for SERIAL/auto-increment)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO app_user;

\echo '[OK] Granted database privileges'

-- ============================================================================
-- 3. Verification
-- ============================================================================

\echo ''
\echo 'Role Verification'
\echo '===================='

-- List created roles
SELECT 
    rolname as "Role Name",
    rolcanlogin as "Can Login",
    rolconnlimit as "Connection Limit",
    CASE WHEN rolvaliduntil IS NULL THEN 'Never' ELSE rolvaliduntil::text END as "Password Expires"
FROM pg_roles 
WHERE rolname IN ('app_user', 'app_login')
ORDER BY rolname;

-- Check role membership
\echo ''
\echo 'Role Membership:'
SELECT 
    r.rolname as "Parent Role",
    m.rolname as "Member Role"
FROM pg_roles r
JOIN pg_auth_members ON r.oid = pg_auth_members.roleid
JOIN pg_roles m ON m.oid = pg_auth_members.member
WHERE r.rolname = 'app_user';

-- Check database privileges
\echo ''
\echo 'Database Privileges for app_user:'
SELECT 
    'CONNECT' as "Privilege Type",
    'Granted' as "Status"
WHERE EXISTS (
    SELECT 1 
    FROM pg_database d, aclexplode(d.datacl) acl
    WHERE d.datname = :'db_name'
    AND acl.grantee = (SELECT oid FROM pg_roles WHERE rolname = 'app_user')
);

\echo ''
\echo '[OK] Setup complete!'
\echo ''
\echo 'Next steps:'
\echo '  1. Ensure your .env has: DB_USER=$DB_APP_USER DB_PASSWORD=$DB_APP_PASSWORD'
\echo '  2. Run migrations: ./scripts/run-migrations.sh'
\echo ''