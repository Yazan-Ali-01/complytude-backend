-- ============================================================================
-- Setup Application User Role for Production
-- ============================================================================
-- Run this ONCE before running migrations in production
-- This creates a dedicated role for the application with limited privileges
-- ============================================================================

-- Create the base application role (no login capability)
CREATE ROLE app_user NOLOGIN;

-- Create a login role that inherits from app_user
-- Replace 'your_secure_password' with a strong password
CREATE ROLE app_login LOGIN PASSWORD 'your_secure_password' IN ROLE app_user;

-- Grant basic database connection privileges
GRANT CONNECT ON DATABASE your_database_name TO app_user;
GRANT USAGE ON SCHEMA public TO app_user;

-- Table permissions will be granted by individual migrations
-- Migration 001 will grant: SELECT, INSERT, UPDATE, DELETE on tenants and users

-- ============================================================================
-- Verification
-- ============================================================================

-- List all roles
SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('app_user', 'app_login');

-- Check role membership
SELECT 
    r.rolname as role,
    m.rolname as member
FROM pg_roles r
JOIN pg_auth_members ON r.oid = pg_auth_members.roleid
JOIN pg_roles m ON m.oid = pg_auth_members.member
WHERE r.rolname = 'app_user';

