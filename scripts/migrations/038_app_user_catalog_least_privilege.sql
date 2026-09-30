BEGIN;

-- =========================
-- Migration 038: the runtime role keeps only the catalog writes the code performs
-- =========================
-- Description: app_user had SELECT, INSERT, UPDATE and DELETE on every catalog table (pricing,
--              RBAC, templates, rulesets, Stripe events). The API still writes most of them
--              (startup syncs, platform-admin endpoints, webhooks, ingestion), so those stay,
--              but a privilege no code path uses is only attack surface: a stray or injected
--              statement could delete plans or rewrite an add-on's grants. Revoked here:
--              - addon_entitlements, template_version_ruleset_versions: never written by the
--                app (seeds run as the admin role): read-only
--              - addons: the Stripe catalog sync only updates it
--              - DELETE where nothing deletes (soft-deleted or kept for history)
--              - UPDATE on link tables whose inserts are ON CONFLICT DO NOTHING
--              apps/api/test/rls/app-role-privileges.integration.spec.ts pins the full map.
-- =========================

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
        REVOKE INSERT, UPDATE, DELETE ON public.addon_entitlements FROM app_user;
        REVOKE INSERT, UPDATE, DELETE ON public.template_version_ruleset_versions FROM app_user;

        REVOKE INSERT, DELETE ON public.addons FROM app_user;

        REVOKE DELETE ON
            public.categories,
            public.credit_packages,
            public.features,
            public.plans,
            public.platform_roles,
            public.ruleset_versions,
            public.rulesets,
            public.stripe_webhook_events,
            public.template_versions,
            public.tenant_roles
        FROM app_user;

        REVOKE UPDATE ON
            public.platform_role_permissions,
            public.ruleset_chunks,
            public.template_rulesets,
            public.tenant_role_permissions
        FROM app_user;
    END IF;
END $$;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
GRANT INSERT, UPDATE, DELETE ON public.addon_entitlements, public.template_version_ruleset_versions TO app_user;
GRANT INSERT, DELETE ON public.addons TO app_user;
GRANT DELETE ON public.categories, public.credit_packages, public.features, public.plans,
    public.platform_roles, public.ruleset_versions, public.rulesets, public.stripe_webhook_events,
    public.template_versions, public.tenant_roles TO app_user;
GRANT UPDATE ON public.platform_role_permissions, public.ruleset_chunks, public.template_rulesets,
    public.tenant_role_permissions TO app_user;
COMMIT;
*/
