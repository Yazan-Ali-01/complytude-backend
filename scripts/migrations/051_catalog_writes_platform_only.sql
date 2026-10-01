BEGIN;

-- =========================
-- Migration 051: pricing and RBAC catalogs written only by the platform login
-- =========================
-- Description: the login that serves tenant requests (app_login, role app_user) could write the
--              pricing and RBAC catalogs (plans, features, their entitlements, add-on prices, credit
--              packages, tenant and platform permissions and roles), so an injected query on any
--              tenant request could change prices, limits or permissions. Every write to them now
--              runs in platform context (the startup syncs and the Stripe catalog sync), which uses
--              the platform login (member of app_platform, migration 045). app_user keeps SELECT;
--              app_platform gets exactly the writes it needs.
-- =========================

REVOKE INSERT, UPDATE ON public.plans FROM app_user;
REVOKE INSERT, UPDATE ON public.features FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON public.plan_entitlements FROM app_user;
REVOKE UPDATE ON public.addons FROM app_user;
REVOKE INSERT, UPDATE ON public.credit_packages FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_permissions FROM app_user;
REVOKE INSERT, DELETE ON public.tenant_role_permissions FROM app_user;
REVOKE INSERT, UPDATE, DELETE ON public.platform_permissions FROM app_user;
REVOKE INSERT, UPDATE ON public.platform_roles FROM app_user;
REVOKE INSERT, DELETE ON public.platform_role_permissions FROM app_user;

GRANT INSERT, UPDATE ON public.plans TO app_platform;
GRANT INSERT, UPDATE ON public.features TO app_platform;
GRANT INSERT, UPDATE, DELETE ON public.plan_entitlements TO app_platform;
GRANT UPDATE ON public.addons TO app_platform;
GRANT INSERT, UPDATE ON public.credit_packages TO app_platform;
GRANT INSERT, UPDATE, DELETE ON public.tenant_permissions TO app_platform;
GRANT INSERT, DELETE ON public.tenant_role_permissions TO app_platform;
GRANT INSERT, UPDATE, DELETE ON public.platform_permissions TO app_platform;
GRANT INSERT, UPDATE ON public.platform_roles TO app_platform;
GRANT INSERT, DELETE ON public.platform_role_permissions TO app_platform;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
REVOKE INSERT, UPDATE ON public.plans FROM app_platform;
REVOKE INSERT, UPDATE ON public.features FROM app_platform;
REVOKE INSERT, UPDATE, DELETE ON public.plan_entitlements FROM app_platform;
REVOKE UPDATE ON public.addons FROM app_platform;
REVOKE INSERT, UPDATE ON public.credit_packages FROM app_platform;
REVOKE INSERT, UPDATE, DELETE ON public.tenant_permissions FROM app_platform;
REVOKE INSERT, DELETE ON public.tenant_role_permissions FROM app_platform;
REVOKE INSERT, UPDATE, DELETE ON public.platform_permissions FROM app_platform;
REVOKE INSERT, UPDATE ON public.platform_roles FROM app_platform;
REVOKE INSERT, DELETE ON public.platform_role_permissions FROM app_platform;
GRANT INSERT, UPDATE ON public.plans TO app_user;
GRANT INSERT, UPDATE ON public.features TO app_user;
GRANT INSERT, UPDATE, DELETE ON public.plan_entitlements TO app_user;
GRANT UPDATE ON public.addons TO app_user;
GRANT INSERT, UPDATE ON public.credit_packages TO app_user;
GRANT INSERT, UPDATE, DELETE ON public.tenant_permissions TO app_user;
GRANT INSERT, DELETE ON public.tenant_role_permissions TO app_user;
GRANT INSERT, UPDATE, DELETE ON public.platform_permissions TO app_user;
GRANT INSERT, UPDATE ON public.platform_roles TO app_user;
GRANT INSERT, DELETE ON public.platform_role_permissions TO app_user;
COMMIT;
*/
