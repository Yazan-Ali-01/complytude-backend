BEGIN;

-- =========================
-- Migration 025: RLS Policies for Entitlements & RBAC Tables
-- =========================
-- Description: Row-level security policies for tenant-scoped entitlements and RBAC tables
-- Tables covered:
--   - tenant_feature_overrides (from 010)
--   - tenant_usage (from 011)
--   - tenant_usage_events (from 011)
--   - tenant_credits (from 015)
--   - credit_transactions (from 015)
--   - audit_logs (from 023)
--   - user_ai_usage (from 024)
-- =========================

-- =========================
-- ENABLE RLS ON ALL TABLES
-- =========================
ALTER TABLE public.tenant_feature_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ai_usage ENABLE ROW LEVEL SECURITY;

-- =========================
-- tenant_feature_overrides
-- =========================
-- Tenants can view their own feature overrides
CREATE POLICY tenant_feature_overrides_select
ON public.tenant_feature_overrides
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- Only system admins can modify feature overrides (via admin role bypass)
CREATE POLICY tenant_feature_overrides_insert
ON public.tenant_feature_overrides
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null() AND is_tenant_admin());

CREATE POLICY tenant_feature_overrides_update
ON public.tenant_feature_overrides
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null() AND is_tenant_admin())
WITH CHECK (tenant_id = current_tenant_id_or_null() AND is_tenant_admin());

-- =========================
-- tenant_usage
-- =========================
-- Tenants can view their own usage
CREATE POLICY tenant_usage_select
ON public.tenant_usage
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert/update usage for current tenant
CREATE POLICY tenant_usage_insert
ON public.tenant_usage
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

CREATE POLICY tenant_usage_update
ON public.tenant_usage
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null())
WITH CHECK (tenant_id = current_tenant_id_or_null());

-- =========================
-- tenant_usage_events
-- =========================
-- Tenants can view their own usage events
CREATE POLICY tenant_usage_events_select
ON public.tenant_usage_events
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert usage events for current tenant
CREATE POLICY tenant_usage_events_insert
ON public.tenant_usage_events
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

-- =========================
-- tenant_credits
-- =========================
-- Tenants can view their own credits
CREATE POLICY tenant_credits_select
ON public.tenant_credits
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert/update credits for current tenant
CREATE POLICY tenant_credits_insert
ON public.tenant_credits
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

CREATE POLICY tenant_credits_update
ON public.tenant_credits
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null())
WITH CHECK (tenant_id = current_tenant_id_or_null());

-- =========================
-- credit_transactions
-- =========================
-- Tenants can view their own transactions
CREATE POLICY credit_transactions_select
ON public.credit_transactions
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert transactions for current tenant
CREATE POLICY credit_transactions_insert
ON public.credit_transactions
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

-- =========================
-- audit_logs
-- =========================
-- Tenants can view their own audit logs
CREATE POLICY audit_logs_select
ON public.audit_logs
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert audit logs for current tenant
CREATE POLICY audit_logs_insert
ON public.audit_logs
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

-- =========================
-- user_ai_usage
-- =========================
-- Tenants can view AI usage for their tenant
CREATE POLICY user_ai_usage_select
ON public.user_ai_usage
FOR SELECT
USING (tenant_id = current_tenant_id_or_null());

-- App can insert/update AI usage for current tenant
CREATE POLICY user_ai_usage_insert
ON public.user_ai_usage
FOR INSERT
WITH CHECK (tenant_id = current_tenant_id_or_null());

CREATE POLICY user_ai_usage_update
ON public.user_ai_usage
FOR UPDATE
USING (tenant_id = current_tenant_id_or_null())
WITH CHECK (tenant_id = current_tenant_id_or_null());

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;

-- Drop user_ai_usage policies
DROP POLICY IF EXISTS user_ai_usage_update ON public.user_ai_usage;
DROP POLICY IF EXISTS user_ai_usage_insert ON public.user_ai_usage;
DROP POLICY IF EXISTS user_ai_usage_select ON public.user_ai_usage;

-- Drop audit_logs policies
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;

-- Drop credit_transactions policies
DROP POLICY IF EXISTS credit_transactions_insert ON public.credit_transactions;
DROP POLICY IF EXISTS credit_transactions_select ON public.credit_transactions;

-- Drop tenant_credits policies
DROP POLICY IF EXISTS tenant_credits_update ON public.tenant_credits;
DROP POLICY IF EXISTS tenant_credits_insert ON public.tenant_credits;
DROP POLICY IF EXISTS tenant_credits_select ON public.tenant_credits;

-- Drop tenant_usage_events policies
DROP POLICY IF EXISTS tenant_usage_events_insert ON public.tenant_usage_events;
DROP POLICY IF EXISTS tenant_usage_events_select ON public.tenant_usage_events;

-- Drop tenant_usage policies
DROP POLICY IF EXISTS tenant_usage_update ON public.tenant_usage;
DROP POLICY IF EXISTS tenant_usage_insert ON public.tenant_usage;
DROP POLICY IF EXISTS tenant_usage_select ON public.tenant_usage;

-- Drop tenant_feature_overrides policies
DROP POLICY IF EXISTS tenant_feature_overrides_update ON public.tenant_feature_overrides;
DROP POLICY IF EXISTS tenant_feature_overrides_insert ON public.tenant_feature_overrides;
DROP POLICY IF EXISTS tenant_feature_overrides_select ON public.tenant_feature_overrides;

-- Disable RLS on all tables
ALTER TABLE public.user_ai_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.credit_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_credits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_feature_overrides DISABLE ROW LEVEL SECURITY;

COMMIT;
*/
