BEGIN;

-- =========================
-- Migration 012: Grants for Entitlements Tables
-- =========================
-- Description: Database permissions for entitlements tables (features, overrides, usage)
-- =========================

-- Note: DELETE is not granted on features (registry)
GRANT SELECT, INSERT, UPDATE ON public.features TO app_user;

-- Note: DELETE is not granted on tenant_feature_overrides (soft-delete pattern via revoked_at)
GRANT SELECT, INSERT, UPDATE ON public.tenant_feature_overrides TO app_user;

-- Note: DELETE is not granted on tenant_usage (per period)
GRANT SELECT, INSERT, UPDATE ON public.tenant_usage TO app_user;

-- Note: DELETE and UPDATE is NOT granted on tenant_usage_events (audit log)
GRANT SELECT, INSERT ON public.tenant_usage_events TO app_user;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
REVOKE ALL ON public.features FROM app_user;
REVOKE ALL ON public.tenant_feature_overrides FROM app_user;
REVOKE ALL ON public.tenant_usage FROM app_user;
REVOKE ALL ON public.tenant_usage_events FROM app_user;
COMMIT;
*/