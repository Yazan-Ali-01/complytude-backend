BEGIN;

-- =========================
-- Migration 041: tenant isolation in the database, roles in the application
-- =========================
-- Description: seven write policies also required is_tenant_admin(), a flag the application set for
--              itself and always passed as true, so it never told an admin from anyone else. Who may
--              change a tenant's settings, members, add-ons or AI consent is decided by the API's
--              tenant RBAC (settings:manage, team:manage, …), which supports custom roles that a
--              database role check can't express. These policies now enforce what the database can:
--              the row belongs to the tenant in context (or the caller is in platform context).
--              The flag and its helper are removed so nothing relies on them.
-- =========================

DROP POLICY tenant_update ON public.tenants;
CREATE POLICY tenant_update
ON public.tenants
FOR UPDATE
USING (id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY user_tenants_admin_insert ON public.user_tenants;
CREATE POLICY user_tenants_admin_insert
ON public.user_tenants
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY user_tenants_admin_update ON public.user_tenants;
CREATE POLICY user_tenants_admin_update
ON public.user_tenants
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY user_tenants_admin_delete ON public.user_tenants;
CREATE POLICY user_tenants_admin_delete
ON public.user_tenants
FOR DELETE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY tenant_addons_insert ON public.tenant_addons;
CREATE POLICY tenant_addons_insert
ON public.tenant_addons
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY tenant_addons_update ON public.tenant_addons;
CREATE POLICY tenant_addons_update
ON public.tenant_addons
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() OR is_platform_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP POLICY tenant_ai_consents_insert ON public.tenant_ai_consents;
CREATE POLICY tenant_ai_consents_insert
ON public.tenant_ai_consents
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() OR is_platform_admin());

DROP FUNCTION public.is_tenant_admin();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
    SELECT COALESCE(current_setting('app.is_tenant_admin', true), 'false') = 'true'
$$;

DROP POLICY tenant_update ON public.tenants;
CREATE POLICY tenant_update ON public.tenants FOR UPDATE
USING ((id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin())
WITH CHECK ((id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY user_tenants_admin_insert ON public.user_tenants;
CREATE POLICY user_tenants_admin_insert ON public.user_tenants FOR INSERT
WITH CHECK ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY user_tenants_admin_update ON public.user_tenants;
CREATE POLICY user_tenants_admin_update ON public.user_tenants FOR UPDATE
USING ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin())
WITH CHECK ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY user_tenants_admin_delete ON public.user_tenants;
CREATE POLICY user_tenants_admin_delete ON public.user_tenants FOR DELETE
USING ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY tenant_addons_insert ON public.tenant_addons;
CREATE POLICY tenant_addons_insert ON public.tenant_addons FOR INSERT
WITH CHECK ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY tenant_addons_update ON public.tenant_addons;
CREATE POLICY tenant_addons_update ON public.tenant_addons FOR UPDATE
USING ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin())
WITH CHECK ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());

DROP POLICY tenant_ai_consents_insert ON public.tenant_ai_consents;
CREATE POLICY tenant_ai_consents_insert ON public.tenant_ai_consents FOR INSERT
WITH CHECK ((tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin());
COMMIT;
*/
