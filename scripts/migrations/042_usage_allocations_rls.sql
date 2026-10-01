BEGIN;

-- =========================
-- Migration 042: row-level security on usage_allocations
-- =========================
-- Description: usage_allocations (each usage event's split across plan, add-on, credit and override)
--              had no RLS, so a lookup by usage_ledger_id alone returned other tenants' rows. It has
--              no tenant_id: a row belongs to whoever owns its usage_ledger row. The policies require
--              that parent row to be visible, and the subquery is itself filtered by usage_ledger's
--              policies, so a row is visible (and insertable) exactly in its tenant's context or in
--              platform context. The app role still has no UPDATE or DELETE (allocations are
--              immutable; a ledger row's deletion cascades).
-- =========================

ALTER TABLE public.usage_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_allocations FORCE ROW LEVEL SECURITY;

CREATE POLICY usage_allocations_select
ON public.usage_allocations
FOR SELECT
USING (
    EXISTS (SELECT 1 FROM public.usage_ledger ul WHERE ul.id = usage_allocations.usage_ledger_id)
);

CREATE POLICY usage_allocations_insert
ON public.usage_allocations
FOR INSERT
WITH CHECK (
    EXISTS (SELECT 1 FROM public.usage_ledger ul WHERE ul.id = usage_allocations.usage_ledger_id)
);

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
/*
BEGIN;
DROP POLICY IF EXISTS usage_allocations_insert ON public.usage_allocations;
DROP POLICY IF EXISTS usage_allocations_select ON public.usage_allocations;
ALTER TABLE public.usage_allocations NO FORCE ROW LEVEL SECURITY;
ALTER TABLE public.usage_allocations DISABLE ROW LEVEL SECURITY;
COMMIT;
*/
