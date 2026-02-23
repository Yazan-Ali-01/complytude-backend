BEGIN;

-- =========================
-- Migration 012: RLS Policies for Entitlement Tables
-- =========================
-- Description: Row-level security policies for tenant-scoped entitlement tables
-- These policies enforce tenant isolation for subscriptions, usage, credits, and events
-- =========================

-- =========================
-- tenant_subscriptions
-- =========================

-- Users can see subscriptions for their current tenant; platform admins see all
CREATE POLICY tenant_subscriptions_select
ON public.tenant_subscriptions
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- Platform admins only: create subscriptions (tenant context is NOT sufficient)
CREATE POLICY tenant_subscriptions_insert
ON public.tenant_subscriptions
FOR INSERT
WITH CHECK (
    is_platform_admin()
);

-- System/admin or platform admin can update subscriptions
CREATE POLICY tenant_subscriptions_update
ON public.tenant_subscriptions
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- tenant_addons
-- =========================

-- Users can see add-ons for their current tenant; platform admins see all
CREATE POLICY tenant_addons_select
ON public.tenant_addons
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- Platform admins only: add add-ons (tenant context is NOT sufficient)
CREATE POLICY tenant_addons_insert
ON public.tenant_addons
FOR INSERT
WITH CHECK (
    is_platform_admin()
);

-- Platform admins can update any add-on; tenant admins can update add-ons for their own tenant
CREATE POLICY tenant_addons_update
ON public.tenant_addons
FOR UPDATE
USING (
    (tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin()
)
WITH CHECK (
    (tenant_id = current_tenant_id_or_null() AND is_tenant_admin()) OR is_platform_admin()
);

-- =========================
-- tenant_overrides
-- =========================

-- Users can see overrides for their current tenant; platform admins see all
CREATE POLICY tenant_overrides_select
ON public.tenant_overrides
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- Platform admins only: create overrides (tenant context is NOT sufficient)
CREATE POLICY tenant_overrides_insert
ON public.tenant_overrides
FOR INSERT
WITH CHECK (
    is_platform_admin()
);

-- Platform admins can update overrides for any tenant
CREATE POLICY tenant_overrides_update
ON public.tenant_overrides
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- usage_ledger
-- =========================

-- Users can see usage for their current tenant; platform admins see all
CREATE POLICY usage_ledger_select
ON public.usage_ledger
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can record usage for current tenant; platform admins for any tenant
CREATE POLICY usage_ledger_insert
ON public.usage_ledger
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- credit_ledger
-- =========================

-- Users can see credits for their current tenant; platform admins see all
CREATE POLICY credit_ledger_select
ON public.credit_ledger
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can record credit transactions; platform admins can grant for any tenant
CREATE POLICY credit_ledger_insert
ON public.credit_ledger
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- aggregated_usage
-- =========================

-- Users can see aggregated usage for their current tenant; platform admins see all
CREATE POLICY aggregated_usage_select
ON public.aggregated_usage
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can create/update aggregated usage; platform admin for system jobs
CREATE POLICY aggregated_usage_insert
ON public.aggregated_usage
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

CREATE POLICY aggregated_usage_update
ON public.aggregated_usage
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can delete stale aggregated usage
CREATE POLICY aggregated_usage_delete
ON public.aggregated_usage
FOR DELETE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- entitlement_snapshots
-- =========================

-- Users can see snapshots for their current tenant; platform admins see all
CREATE POLICY entitlement_snapshots_select
ON public.entitlement_snapshots
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can create snapshots; platform admin for system operations
CREATE POLICY entitlement_snapshots_insert
ON public.entitlement_snapshots
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can update/invalidate snapshots
CREATE POLICY entitlement_snapshots_update
ON public.entitlement_snapshots
FOR UPDATE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
)
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- App can delete old snapshots
CREATE POLICY entitlement_snapshots_delete
ON public.entitlement_snapshots
FOR DELETE
USING (
    tenant_id = current_tenant_id_or_null() OR is_platform_admin()
);

-- =========================
-- domain_events
-- =========================

-- Users can see events for their current tenant; platform admins see all
-- System events (tenant_id IS NULL) are visible to all
CREATE POLICY domain_events_select
ON public.domain_events
FOR SELECT
USING (
    tenant_id = current_tenant_id_or_null() OR tenant_id IS NULL OR is_platform_admin()
);

-- App can record events for current tenant or system events
CREATE POLICY domain_events_insert
ON public.domain_events
FOR INSERT
WITH CHECK (
    tenant_id = current_tenant_id_or_null() OR tenant_id IS NULL OR is_platform_admin()
);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop domain_events policies
DROP POLICY IF EXISTS domain_events_insert ON public.domain_events;
DROP POLICY IF EXISTS domain_events_select ON public.domain_events;

-- Drop entitlement_snapshots policies
DROP POLICY IF EXISTS entitlement_snapshots_delete ON public.entitlement_snapshots;
DROP POLICY IF EXISTS entitlement_snapshots_update ON public.entitlement_snapshots;
DROP POLICY IF EXISTS entitlement_snapshots_insert ON public.entitlement_snapshots;
DROP POLICY IF EXISTS entitlement_snapshots_select ON public.entitlement_snapshots;

-- Drop aggregated_usage policies
DROP POLICY IF EXISTS aggregated_usage_delete ON public.aggregated_usage;
DROP POLICY IF EXISTS aggregated_usage_update ON public.aggregated_usage;
DROP POLICY IF EXISTS aggregated_usage_insert ON public.aggregated_usage;
DROP POLICY IF EXISTS aggregated_usage_select ON public.aggregated_usage;

-- Drop credit_ledger policies
DROP POLICY IF EXISTS credit_ledger_insert ON public.credit_ledger;
DROP POLICY IF EXISTS credit_ledger_select ON public.credit_ledger;

-- Drop usage_ledger policies
DROP POLICY IF EXISTS usage_ledger_insert ON public.usage_ledger;
DROP POLICY IF EXISTS usage_ledger_select ON public.usage_ledger;

-- Drop tenant_overrides policies
DROP POLICY IF EXISTS tenant_overrides_update ON public.tenant_overrides;
DROP POLICY IF EXISTS tenant_overrides_insert ON public.tenant_overrides;
DROP POLICY IF EXISTS tenant_overrides_select ON public.tenant_overrides;

-- Drop tenant_addons policies
DROP POLICY IF EXISTS tenant_addons_update ON public.tenant_addons;
DROP POLICY IF EXISTS tenant_addons_insert ON public.tenant_addons;
DROP POLICY IF EXISTS tenant_addons_select ON public.tenant_addons;

-- Drop tenant_subscriptions policies
DROP POLICY IF EXISTS tenant_subscriptions_update ON public.tenant_subscriptions;
DROP POLICY IF EXISTS tenant_subscriptions_insert ON public.tenant_subscriptions;
DROP POLICY IF EXISTS tenant_subscriptions_select ON public.tenant_subscriptions;

COMMIT;
*/
