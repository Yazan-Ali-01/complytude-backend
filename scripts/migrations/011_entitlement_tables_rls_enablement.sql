BEGIN;

-- =========================
-- Migration 011: Enable Row Level Security on Entitlement Tables
-- =========================
-- Description: Enable RLS on tenant-scoped entitlement tables to enforce tenant isolation
-- Note: FORCE ROW LEVEL SECURITY ensures RLS applies even to table owners
-- 
-- RLS Strategy:
-- - tenant_subscriptions, tenant_addons, tenant_overrides: Tenant isolation
-- - usage_ledger, credit_ledger: Tenant isolation for usage/credit events
-- - aggregated_usage: Tenant isolation for usage projections
-- - entitlement_snapshots: Tenant isolation for cached entitlements
-- - domain_events: Tenant isolation for audit events (NULL tenant_id for system events)
-- =========================

-- =========================
-- Enable RLS on Tenant-Scoped Entitlement Tables
-- =========================

-- Subscription Management
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addons FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tenant_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_overrides FORCE ROW LEVEL SECURITY;

-- Event Ledgers
ALTER TABLE public.usage_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger FORCE ROW LEVEL SECURITY;

ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger FORCE ROW LEVEL SECURITY;

-- Projections
ALTER TABLE public.aggregated_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregated_usage FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entitlement_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_snapshots FORCE ROW LEVEL SECURITY;

-- Domain Events
ALTER TABLE public.domain_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domain_events FORCE ROW LEVEL SECURITY;

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Disable RLS on entitlement tables
ALTER TABLE public.domain_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.aggregated_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_ledger DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_overrides DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_addons DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions DISABLE ROW LEVEL SECURITY;

COMMIT;
*/
