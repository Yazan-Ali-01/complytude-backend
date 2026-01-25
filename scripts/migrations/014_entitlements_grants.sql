BEGIN;

-- =========================
-- Migration 014: Grants for Entitlements Tables
-- =========================
-- Description: Database permissions for entitlements tables (features, overrides, usage)
-- =========================

GRANT SELECT ON public.features TO complytude_app;
GRANT ALL ON public.features TO complytude_admin;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_feature_overrides TO complytude_app;
GRANT ALL ON public.tenant_feature_overrides TO complytude_admin;

GRANT SELECT, INSERT, UPDATE ON public.tenant_usage TO complytude_app;
GRANT ALL ON public.tenant_usage TO complytude_admin;

GRANT SELECT, INSERT ON public.tenant_usage_events TO complytude_app;
GRANT ALL ON public.tenant_usage_events TO complytude_admin;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
REVOKE ALL ON public.features FROM complytude_app, complytude_admin;
REVOKE ALL ON public.tenant_feature_overrides FROM complytude_app, complytude_admin;
REVOKE ALL ON public.tenant_usage FROM complytude_app, complytude_admin;
REVOKE ALL ON public.tenant_usage_events FROM complytude_app, complytude_admin;
COMMIT;
*/