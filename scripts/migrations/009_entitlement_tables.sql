BEGIN;

-- =========================
-- Migration 009: Entitlement System Tables
-- =========================
-- Description: Complete entitlement engine schema including features, plans, subscriptions,
--              usage tracking, credit ledger, and domain events
-- =========================

-- =========================
-- ENUMS
-- =========================

CREATE TYPE feature_type AS ENUM ('boolean', 'quota', 'metered', 'capacity', 'rate_limit');
CREATE TYPE subscription_status AS ENUM ('active', 'cancelled', 'past_due', 'trialing');
CREATE TYPE credit_transaction_type AS ENUM ('purchase', 'grant', 'deduction', 'expiry', 'refund');
CREATE TYPE usage_source AS ENUM ('plan', 'addon', 'credit', 'override');

COMMENT ON TYPE feature_type IS 'Types of features: boolean (on/off), quota (per billing period), metered (per usage), capacity (max resources), rate_limit (time-based)';
COMMENT ON TYPE subscription_status IS 'Subscription lifecycle states';
COMMENT ON TYPE credit_transaction_type IS 'Types of credit transactions';
COMMENT ON TYPE usage_source IS 'Source of usage: plan entitlement, addon, credit deduction, or admin override';

-- =========================
-- CATALOG TABLES (Global, No RLS)
-- =========================

-- Features: Catalog of all available features
CREATE TABLE public.features (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) UNIQUE NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description TEXT,
    feature_type feature_type NOT NULL,
    unit        VARCHAR(50),
    creditable  BOOLEAN NOT NULL DEFAULT false,
    credit_cost INTEGER, -- Cost in credits per unit (NULL for non-creditable features)
    is_active   BOOLEAN NOT NULL DEFAULT true,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.features IS 'Feature catalog defining all available features in the system';
COMMENT ON COLUMN public.features.key IS 'Unique feature key (e.g., documents_per_month, redlining_enabled)';
COMMENT ON COLUMN public.features.feature_type IS 'Type of feature: boolean, quota, metered, capacity, rate_limit';
COMMENT ON COLUMN public.features.unit IS 'Unit of measurement for quota/metered features (e.g., documents, queries, seats)';
COMMENT ON COLUMN public.features.creditable IS 'Whether this feature can fallback to credits when quota is exceeded';
COMMENT ON COLUMN public.features.credit_cost IS 'Cost in credits per unit of usage (NULL for non-creditable features)';

-- Plans: Subscription tier catalog
CREATE TABLE public.plans (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                       VARCHAR(50) UNIQUE NOT NULL,
    name                      VARCHAR(255) NOT NULL,
    description               TEXT,
    price_monthly             DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_currency            VARCHAR(3) NOT NULL DEFAULT 'AED',
    billing_period            VARCHAR(20) NOT NULL DEFAULT 'monthly',
    is_active                 BOOLEAN NOT NULL DEFAULT true,
    sort_order                INTEGER NOT NULL DEFAULT 0,
    metadata                  JSONB DEFAULT '{}',
    stripe_product_id         VARCHAR(255) UNIQUE DEFAULT NULL,
    stripe_price_id_monthly   VARCHAR(255) UNIQUE DEFAULT NULL,
    stripe_price_id_annual    VARCHAR(255) UNIQUE DEFAULT NULL,
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.plans IS 'Subscription plan catalog (navigator, shield, general_counsel, infrastructure)';
COMMENT ON COLUMN public.plans.key IS 'Unique plan key (e.g., navigator, shield, general_counsel, infrastructure)';
COMMENT ON COLUMN public.plans.billing_period IS 'Billing cycle: monthly, yearly';
COMMENT ON COLUMN public.plans.sort_order IS 'Display order for plan listing';
COMMENT ON COLUMN public.plans.stripe_product_id IS 'Stripe product ID (prod_xxx), NULL for Navigator (free) plan';
COMMENT ON COLUMN public.plans.stripe_price_id_monthly IS 'Stripe price ID for monthly billing (price_xxx)';
COMMENT ON COLUMN public.plans.stripe_price_id_annual IS 'Stripe price ID for annual billing (price_xxx)';

-- Plan Entitlements: What each plan grants
CREATE TABLE public.plan_entitlements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plan_id     UUID NOT NULL REFERENCES public.plans(id) ON DELETE CASCADE,
    feature_id  UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
    value_bool  BOOLEAN,
    value_int   INTEGER,
    value_text  VARCHAR(255),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_plan_entitlements_plan_feature UNIQUE (plan_id, feature_id),
    CONSTRAINT chk_plan_entitlements_value CHECK (
        (value_bool IS NOT NULL AND value_int IS NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NOT NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NULL AND value_text IS NOT NULL)
    )
);

COMMENT ON TABLE public.plan_entitlements IS 'Plan-feature matrix defining what each plan grants';
COMMENT ON COLUMN public.plan_entitlements.value_bool IS 'Boolean value for boolean features';
COMMENT ON COLUMN public.plan_entitlements.value_int IS 'Integer value for quota/capacity features (-1 = unlimited)';
COMMENT ON COLUMN public.plan_entitlements.value_text IS 'Text value for tiered features (e.g., essential, full, jais_native)';
COMMENT ON CONSTRAINT chk_plan_entitlements_value ON public.plan_entitlements IS 'Exactly one value field must be set';

-- Add-ons: Purchasable extras
CREATE TABLE public.addons (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key                 VARCHAR(100) UNIQUE NOT NULL,
    name                VARCHAR(255) NOT NULL,
    description         TEXT,
    price_monthly       DECIMAL(10, 2) NOT NULL DEFAULT 0,
    price_currency      VARCHAR(3) NOT NULL DEFAULT 'AED',
    is_active           BOOLEAN NOT NULL DEFAULT true,
    metadata            JSONB DEFAULT '{}',
    stripe_product_id   VARCHAR(255) UNIQUE DEFAULT NULL,
    stripe_price_id     VARCHAR(255) UNIQUE DEFAULT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.addons IS 'Add-on catalog for supplemental entitlements';
COMMENT ON COLUMN public.addons.key IS 'Unique add-on key (e.g., extra_50_documents, extra_5_seats)';
COMMENT ON COLUMN public.addons.stripe_product_id IS 'Stripe product ID (prod_xxx), NULL until synced';
COMMENT ON COLUMN public.addons.stripe_price_id IS 'Stripe price ID (price_xxx), NULL until synced';

-- Add-on Entitlements: What each add-on grants
CREATE TABLE public.addon_entitlements (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    addon_id    UUID NOT NULL REFERENCES public.addons(id) ON DELETE CASCADE,
    feature_id  UUID NOT NULL REFERENCES public.features(id) ON DELETE CASCADE,
    value_bool  BOOLEAN,
    value_int   INTEGER,
    value_text  VARCHAR(255),
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_addon_entitlements_addon_feature UNIQUE (addon_id, feature_id),
    CONSTRAINT chk_addon_entitlements_value CHECK (
        (value_bool IS NOT NULL AND value_int IS NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NOT NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NULL AND value_text IS NOT NULL)
    )
);

COMMENT ON TABLE public.addon_entitlements IS 'Add-on-feature matrix defining what each add-on grants';
COMMENT ON CONSTRAINT chk_addon_entitlements_value ON public.addon_entitlements IS 'Exactly one value field must be set';

-- =========================
-- TENANT-SCOPED TABLES (RLS Enabled)
-- =========================

-- Tenant Subscriptions: Active plan binding with billing periods
CREATE TABLE public.tenant_subscriptions (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan_id                     UUID NOT NULL REFERENCES public.plans(id),
    status                      subscription_status NOT NULL DEFAULT 'active',
    billing_period_start        TIMESTAMPTZ NOT NULL,
    billing_period_end          TIMESTAMPTZ NOT NULL,
    current_period_start        TIMESTAMPTZ NOT NULL,
    current_period_end          TIMESTAMPTZ NOT NULL,
    cancelled_at                TIMESTAMPTZ,
    metadata                    JSONB DEFAULT '{}',
    stripe_subscription_id      VARCHAR(255) UNIQUE DEFAULT NULL,
    stripe_schedule_id          VARCHAR(255) DEFAULT NULL,
    stripe_current_period_end   TIMESTAMPTZ DEFAULT NULL,
    stripe_status               VARCHAR(50) DEFAULT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tenant_subscriptions IS 'Tenant subscription records with billing period tracking';
COMMENT ON COLUMN public.tenant_subscriptions.billing_period_start IS 'Overall subscription start date';
COMMENT ON COLUMN public.tenant_subscriptions.billing_period_end IS 'Overall subscription end date (NULL for ongoing)';
COMMENT ON COLUMN public.tenant_subscriptions.current_period_start IS 'Current billing cycle start';
COMMENT ON COLUMN public.tenant_subscriptions.current_period_end IS 'Current billing cycle end';
COMMENT ON COLUMN public.tenant_subscriptions.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx), NULL for Navigator (free) plan';
COMMENT ON COLUMN public.tenant_subscriptions.stripe_schedule_id IS 'Stripe subscription schedule ID (sub_sched_xxx), set when a plan change is pending';
COMMENT ON COLUMN public.tenant_subscriptions.stripe_current_period_end IS 'Stripe billing period end (source of truth for billing cycle)';
COMMENT ON COLUMN public.tenant_subscriptions.stripe_status IS 'Stripe subscription status (active, past_due, canceled, etc.)';

-- Tenant Add-ons: Active add-on bindings
CREATE TABLE public.tenant_addons (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id                   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    addon_id                    UUID NOT NULL REFERENCES public.addons(id),
    quantity                    INTEGER NOT NULL DEFAULT 1,
    status                      VARCHAR(20) NOT NULL DEFAULT 'active',
    starts_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at                  TIMESTAMPTZ,
    metadata                    JSONB DEFAULT '{}',
    stripe_subscription_item_id VARCHAR(255) DEFAULT NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tenant_addons_quantity CHECK (quantity > 0)
);

COMMENT ON TABLE public.tenant_addons IS 'Tenant add-on subscriptions';
COMMENT ON COLUMN public.tenant_addons.quantity IS 'Number of add-on units purchased';
COMMENT ON COLUMN public.tenant_addons.expires_at IS 'Add-on expiration (NULL for ongoing)';
COMMENT ON COLUMN public.tenant_addons.stripe_subscription_item_id IS 'Stripe subscription item ID (si_xxx) linking this add-on to a Stripe subscription';

-- Tenant Overrides: Admin-applied entitlement overrides
CREATE TABLE public.tenant_overrides (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_id  UUID NOT NULL REFERENCES public.features(id),
    value_bool  BOOLEAN,
    value_int   INTEGER,
    value_text  VARCHAR(255),
    reason      TEXT NOT NULL,
    applied_by  UUID NOT NULL REFERENCES public.users(id),
    starts_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_tenant_overrides_value CHECK (
        (value_bool IS NOT NULL AND value_int IS NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NOT NULL AND value_text IS NULL) OR
        (value_bool IS NULL AND value_int IS NULL AND value_text IS NOT NULL)
    )
);

COMMENT ON TABLE public.tenant_overrides IS 'Admin-applied entitlement overrides (rare, for special cases)';
COMMENT ON COLUMN public.tenant_overrides.reason IS 'Justification for override';
COMMENT ON COLUMN public.tenant_overrides.applied_by IS 'Admin user who applied the override';
COMMENT ON COLUMN public.tenant_overrides.expires_at IS 'Override expiration (NULL for permanent)';

-- =========================
-- EVENT LEDGERS (Append-Only, RLS Enabled)
-- =========================

-- Usage Ledger: Append-only usage event store (SOURCE OF TRUTH)
CREATE TABLE public.usage_ledger (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    feature_id      UUID NOT NULL REFERENCES public.features(id),
    user_id         UUID REFERENCES public.users(id),
    units           INTEGER NOT NULL DEFAULT 1,
    billing_period  VARCHAR(7) NOT NULL,
    resource_type   VARCHAR(50),
    resource_id     UUID,
    metadata        JSONB DEFAULT '{}',
    idempotency_key VARCHAR(255),
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    projected_at    TIMESTAMPTZ NULL,

    CONSTRAINT chk_usage_units CHECK (units > 0)
);

COMMENT ON TABLE public.usage_ledger IS 'Append-only usage event ledger (immutable source of truth)';
COMMENT ON COLUMN public.usage_ledger.billing_period IS 'Billing period in YYYY-MM format';
COMMENT ON COLUMN public.usage_ledger.resource_type IS 'Type of resource created (e.g., document, contract_review)';
COMMENT ON COLUMN public.usage_ledger.resource_id IS 'ID of the resource created';
COMMENT ON COLUMN public.usage_ledger.idempotency_key IS 'Prevents duplicate event recording';
COMMENT ON COLUMN public.usage_ledger.projected_at IS 'Timestamp when this event was projected into aggregated_usage (NULL = not yet projected). Used as CAS idempotency guard.';

-- Usage Allocations: Per-source funding breakdown for usage events
CREATE TABLE public.usage_allocations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usage_ledger_id UUID NOT NULL REFERENCES public.usage_ledger(id) ON DELETE CASCADE,
    source          usage_source NOT NULL,
    units           INTEGER NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT chk_allocation_units CHECK (units > 0)
);

COMMENT ON TABLE public.usage_allocations IS 'Per-source funding breakdown for usage events (1..N allocations per usage_ledger row)';
COMMENT ON COLUMN public.usage_allocations.usage_ledger_id IS 'Foreign key to usage_ledger event';
COMMENT ON COLUMN public.usage_allocations.source IS 'Funding source: plan, addon, credit, override';
COMMENT ON COLUMN public.usage_allocations.units IS 'Number of units allocated from this source (must be > 0)';

-- Deferrable constraint trigger: SUM(usage_allocations.units) must equal usage_ledger.units
CREATE OR REPLACE FUNCTION validate_usage_allocations_sum()
RETURNS TRIGGER AS $$
DECLARE
    ledger_units INTEGER;
    allocations_sum INTEGER;
BEGIN
    -- Get the total units from usage_ledger
    SELECT units INTO ledger_units
    FROM public.usage_ledger
    WHERE id = COALESCE(NEW.usage_ledger_id, OLD.usage_ledger_id);

    -- Get the sum of all allocations for this usage event
    SELECT COALESCE(SUM(units), 0) INTO allocations_sum
    FROM public.usage_allocations
    WHERE usage_ledger_id = COALESCE(NEW.usage_ledger_id, OLD.usage_ledger_id);

    -- Check if sum matches (only enforce at transaction commit via DEFERRABLE)
    IF allocations_sum != ledger_units THEN
        RAISE EXCEPTION 'Usage allocations sum (%) does not match usage_ledger units (%) for usage_ledger_id=%',
            allocations_sum, ledger_units, COALESCE(NEW.usage_ledger_id, OLD.usage_ledger_id)
            USING ERRCODE = '23514',  -- check_violation
                  HINT = 'The sum of all usage_allocations.units must equal usage_ledger.units';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_usage_allocations_sum() IS 'Validates that SUM(usage_allocations.units) equals usage_ledger.units';

CREATE CONSTRAINT TRIGGER validate_usage_allocations_sum_trigger
    AFTER INSERT OR UPDATE OR DELETE ON public.usage_allocations
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION validate_usage_allocations_sum();

COMMENT ON TRIGGER validate_usage_allocations_sum_trigger ON public.usage_allocations IS 'Ensures allocations sum equals usage_ledger.units (deferred to transaction commit)';

-- Immutability enforcement for usage_ledger (using triggers, not rules)
-- Triggers enforce immutability AFTER permission checks and raise explicit errors.
--
-- usage_ledger has a single permitted mutation: setting projected_at (NULL → timestamp).
-- This is used by the idempotency CAS in ProjectionUpdateHandler / sync fallback.
-- All other UPDATE columns and all DELETEs are blocked.
CREATE OR REPLACE FUNCTION prevent_usage_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow setting projected_at exactly once (NULL → non-NULL).
    -- All other columns must remain unchanged.
    IF TG_OP = 'UPDATE' THEN
        IF OLD.projected_at IS NULL AND NEW.projected_at IS NOT NULL AND
           NEW.id               = OLD.id               AND
           NEW.tenant_id        = OLD.tenant_id        AND
           NEW.feature_id       = OLD.feature_id       AND
           NEW.user_id          IS NOT DISTINCT FROM OLD.user_id AND
           NEW.units            = OLD.units            AND
           NEW.billing_period   = OLD.billing_period   AND
           NEW.resource_type    IS NOT DISTINCT FROM OLD.resource_type AND
           NEW.resource_id      IS NOT DISTINCT FROM OLD.resource_id  AND
           NEW.idempotency_key  IS NOT DISTINCT FROM OLD.idempotency_key AND
           NEW.recorded_at      = OLD.recorded_at AND
           NEW.metadata         IS NOT DISTINCT FROM OLD.metadata
        THEN
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION 'usage_ledger is immutable. Only projected_at may be set once (NULL → timestamp).'
        USING ERRCODE = '42501',
              HINT = 'usage_ledger is append-only. Use claimForProjection() to set projected_at.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_usage_ledger_modification() IS 'Enforces immutability of usage_ledger; only allows setting projected_at once (NULL → timestamp)';

CREATE TRIGGER prevent_usage_ledger_update
    BEFORE UPDATE ON public.usage_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_usage_ledger_modification();

CREATE TRIGGER prevent_usage_ledger_delete
    BEFORE DELETE ON public.usage_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_usage_ledger_modification();

COMMENT ON TRIGGER prevent_usage_ledger_update ON public.usage_ledger IS 'Blocks UPDATE except projected_at (NULL→timestamp) to enforce immutability';
COMMENT ON TRIGGER prevent_usage_ledger_delete ON public.usage_ledger IS 'Blocks DELETE operations to enforce immutability';

-- Generic immutability for tables with no permitted mutations (usage_allocations, credit_ledger)
CREATE OR REPLACE FUNCTION prevent_ledger_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Ledger tables are immutable. UPDATE and DELETE operations are not allowed.'
        USING ERRCODE = '42501',
              HINT = 'Ledgers are append-only for audit integrity. Use INSERT only.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_ledger_modification() IS 'Enforces full immutability of ledger tables (usage_allocations, credit_ledger)';

-- Immutability enforcement for usage_allocations (using triggers)
CREATE TRIGGER prevent_usage_allocations_update
    BEFORE UPDATE ON public.usage_allocations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

CREATE TRIGGER prevent_usage_allocations_delete
    BEFORE DELETE ON public.usage_allocations
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

COMMENT ON TRIGGER prevent_usage_allocations_update ON public.usage_allocations IS 'Blocks UPDATE operations to enforce immutability';
COMMENT ON TRIGGER prevent_usage_allocations_delete ON public.usage_allocations IS 'Blocks DELETE operations to enforce immutability';

-- Credit Ledger: Append-only credit transaction store (SOURCE OF TRUTH)
CREATE TABLE public.credit_ledger (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id               UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    transaction_type        credit_transaction_type NOT NULL,
    amount                  INTEGER NOT NULL,
    balance_after           INTEGER NOT NULL,
    feature_id              UUID REFERENCES public.features(id),
    usage_ledger_id         UUID REFERENCES public.usage_ledger(id),
    reason                  TEXT,
    applied_by              UUID REFERENCES public.users(id),
    expires_at              TIMESTAMPTZ,
    metadata                JSONB DEFAULT '{}',
    idempotency_key         VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    recorded_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.credit_ledger IS 'Append-only credit transaction ledger (immutable source of truth)';
COMMENT ON COLUMN public.credit_ledger.amount IS 'Credit amount (positive for credit, negative for deduction)';
COMMENT ON COLUMN public.credit_ledger.balance_after IS 'Running balance after this transaction';
COMMENT ON COLUMN public.credit_ledger.feature_id IS 'Feature for which credits were used (NULL for general credits)';
COMMENT ON COLUMN public.credit_ledger.usage_ledger_id IS 'Link to usage event that triggered credit deduction';
COMMENT ON COLUMN public.credit_ledger.expires_at IS 'Credit expiration date (NULL for non-expiring)';
COMMENT ON COLUMN public.credit_ledger.stripe_payment_intent_id IS 'Stripe payment intent ID (pi_xxx) for purchase transactions';

-- Immutability enforcement for credit_ledger (using triggers)
CREATE TRIGGER prevent_credit_ledger_update
    BEFORE UPDATE ON public.credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

CREATE TRIGGER prevent_credit_ledger_delete
    BEFORE DELETE ON public.credit_ledger
    FOR EACH ROW
    EXECUTE FUNCTION prevent_ledger_modification();

COMMENT ON TRIGGER prevent_credit_ledger_update ON public.credit_ledger IS 'Blocks UPDATE operations to enforce immutability';
COMMENT ON TRIGGER prevent_credit_ledger_delete ON public.credit_ledger IS 'Blocks DELETE operations to enforce immutability';

-- =========================
-- PROJECTIONS (Derived Data)
-- =========================

-- Aggregated Usage: Derived projection from usage_ledger (NOT source of truth)
CREATE TABLE public.aggregated_usage (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES public.tenant_subscriptions(id) ON DELETE CASCADE,
    feature_id      UUID NOT NULL REFERENCES public.features(id),
    billing_period  VARCHAR(7) NOT NULL,
    total_units     INTEGER NOT NULL DEFAULT 0,
    plan_units      INTEGER NOT NULL DEFAULT 0,
    addon_units     INTEGER NOT NULL DEFAULT 0,
    credit_units    INTEGER NOT NULL DEFAULT 0,
    override_units  INTEGER NOT NULL DEFAULT 0,
    last_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT uq_aggregated_usage_subscription_feature UNIQUE (subscription_id, feature_id)
);

COMMENT ON TABLE public.aggregated_usage IS 'Aggregated usage projection (rebuilt from usage_ledger) - one row per subscription per feature';
COMMENT ON COLUMN public.aggregated_usage.subscription_id IS 'Subscription ID (source of truth for billing period boundaries)';
COMMENT ON COLUMN public.aggregated_usage.billing_period IS 'Billing period in YYYY-MM format (derived from subscription start, for analytics convenience)';
COMMENT ON COLUMN public.aggregated_usage.total_units IS 'Total usage across all sources';
COMMENT ON COLUMN public.aggregated_usage.plan_units IS 'Usage from plan entitlement';
COMMENT ON COLUMN public.aggregated_usage.addon_units IS 'Usage from add-ons';
COMMENT ON COLUMN public.aggregated_usage.credit_units IS 'Usage paid with credits';
COMMENT ON COLUMN public.aggregated_usage.override_units IS 'Usage from admin overrides';

-- Entitlement Snapshots: Cached effective entitlements (performance optimization)
CREATE TABLE public.entitlement_snapshots (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    snapshot_data   JSONB NOT NULL,
    subscription_id UUID REFERENCES public.tenant_subscriptions(id),
    valid_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
    invalidated_at  TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.entitlement_snapshots IS 'Cached effective entitlements (invalidated on plan/addon/override changes)';
COMMENT ON COLUMN public.entitlement_snapshots.snapshot_data IS 'Full resolved entitlements as JSONB';
COMMENT ON COLUMN public.entitlement_snapshots.invalidated_at IS 'When snapshot was invalidated (NULL = current)';

-- Only one active snapshot per tenant
CREATE UNIQUE INDEX idx_entitlement_snapshots_active
    ON public.entitlement_snapshots(tenant_id)
    WHERE invalidated_at IS NULL;

-- =========================
-- DOMAIN EVENTS (Audit Log)
-- =========================

-- Domain Events: Append-only event store for domain-level auditing
CREATE TABLE public.domain_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID REFERENCES public.tenants(id),
    event_type      VARCHAR(100) NOT NULL,
    aggregate_type  VARCHAR(50) NOT NULL,
    aggregate_id    UUID NOT NULL,
    actor_id        UUID REFERENCES public.users(id),
    actor_type      VARCHAR(20) NOT NULL DEFAULT 'user',
    payload         JSONB NOT NULL DEFAULT '{}',
    metadata        JSONB DEFAULT '{}',
    sequence_number BIGINT,
    recorded_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.domain_events IS 'Append-only domain event store for auditing and replayability';
COMMENT ON COLUMN public.domain_events.event_type IS 'Event type (e.g., usage.recorded, credit.deducted, plan.changed)';
COMMENT ON COLUMN public.domain_events.aggregate_type IS 'Aggregate type (e.g., entitlement, usage, credit, subscription)';
COMMENT ON COLUMN public.domain_events.aggregate_id IS 'ID of the related entity';
COMMENT ON COLUMN public.domain_events.actor_type IS 'Actor type: user, system, admin';
COMMENT ON COLUMN public.domain_events.sequence_number IS 'Sequence number within aggregate for ordering';

-- Immutability enforcement for domain_events (using triggers)
CREATE OR REPLACE FUNCTION prevent_domain_event_modification()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Domain events are immutable. UPDATE and DELETE operations are not allowed.'
        USING ERRCODE = '42501',  -- insufficient_privilege
              HINT = 'Domain events are append-only for audit integrity and replayability.';
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION prevent_domain_event_modification() IS 'Enforces immutability of domain_events table by blocking UPDATE and DELETE operations';

CREATE TRIGGER prevent_domain_event_update
    BEFORE UPDATE ON public.domain_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_domain_event_modification();

CREATE TRIGGER prevent_domain_event_delete
    BEFORE DELETE ON public.domain_events
    FOR EACH ROW
    EXECUTE FUNCTION prevent_domain_event_modification();

COMMENT ON TRIGGER prevent_domain_event_update ON public.domain_events IS 'Blocks UPDATE operations to enforce immutability';
COMMENT ON TRIGGER prevent_domain_event_delete ON public.domain_events IS 'Blocks DELETE operations to enforce immutability';

-- =========================
-- INDEXES
-- =========================

-- Features
CREATE INDEX idx_features_key ON public.features(key);
CREATE INDEX idx_features_is_active ON public.features(is_active) WHERE is_active = true;

-- Plans
CREATE INDEX idx_plans_key ON public.plans(key);
CREATE INDEX idx_plans_is_active ON public.plans(is_active) WHERE is_active = true;
CREATE INDEX idx_plans_sort_order ON public.plans(sort_order);

-- Plan Entitlements
CREATE INDEX idx_plan_entitlements_plan_id ON public.plan_entitlements(plan_id);
CREATE INDEX idx_plan_entitlements_feature_id ON public.plan_entitlements(feature_id);

-- Addons
CREATE INDEX idx_addons_key ON public.addons(key);
CREATE INDEX idx_addons_is_active ON public.addons(is_active) WHERE is_active = true;

-- Addon Entitlements
CREATE INDEX idx_addon_entitlements_addon_id ON public.addon_entitlements(addon_id);
CREATE INDEX idx_addon_entitlements_feature_id ON public.addon_entitlements(feature_id);

-- Tenant Subscriptions
CREATE INDEX idx_tenant_subscriptions_tenant_id ON public.tenant_subscriptions(tenant_id);
CREATE INDEX idx_tenant_subscriptions_plan_id ON public.tenant_subscriptions(plan_id);
CREATE INDEX idx_tenant_subscriptions_status ON public.tenant_subscriptions(status);
CREATE INDEX idx_tenant_subscriptions_tenant_active ON public.tenant_subscriptions(tenant_id, status)
    WHERE status = 'active';

-- Unique constraint: only one active subscription per tenant (for upsert in SubscriptionsRepository)
CREATE UNIQUE INDEX idx_tenant_subscriptions_tenant_active_unique
    ON public.tenant_subscriptions(tenant_id)
    WHERE status = 'active';

-- Tenant Addons
CREATE INDEX idx_tenant_addons_tenant_id ON public.tenant_addons(tenant_id);
CREATE INDEX idx_tenant_addons_addon_id ON public.tenant_addons(addon_id);
CREATE INDEX idx_tenant_addons_tenant_active ON public.tenant_addons(tenant_id, status)
    WHERE status = 'active';

-- Partial unique index: prevent duplicate active addons per tenant
CREATE UNIQUE INDEX idx_tenant_addons_unique_active
    ON public.tenant_addons (tenant_id, addon_id)
    WHERE status = 'active';

-- Tenant Overrides
CREATE INDEX idx_tenant_overrides_tenant_id ON public.tenant_overrides(tenant_id);
CREATE INDEX idx_tenant_overrides_feature_id ON public.tenant_overrides(feature_id);
CREATE INDEX idx_tenant_overrides_tenant_active ON public.tenant_overrides(tenant_id, is_active)
    WHERE is_active = true;
CREATE INDEX idx_tenant_overrides_expires_at ON public.tenant_overrides(expires_at)
    WHERE expires_at IS NOT NULL;

-- Usage Ledger
CREATE INDEX idx_usage_ledger_tenant_id ON public.usage_ledger(tenant_id);
CREATE INDEX idx_usage_ledger_feature_id ON public.usage_ledger(feature_id);
CREATE INDEX idx_usage_ledger_tenant_feature_period ON public.usage_ledger(tenant_id, feature_id, billing_period);
CREATE INDEX idx_usage_ledger_recorded_at ON public.usage_ledger(recorded_at DESC);
CREATE UNIQUE INDEX idx_usage_ledger_idempotency_key ON public.usage_ledger(idempotency_key)
    WHERE idempotency_key IS NOT NULL;
-- Partial index for finding unprojected events (stuck event detection + reconciliation)
CREATE INDEX idx_usage_ledger_unprojected ON public.usage_ledger(recorded_at) WHERE projected_at IS NULL;

-- Usage Allocations
CREATE INDEX idx_usage_allocations_ledger_id ON public.usage_allocations(usage_ledger_id);
CREATE INDEX idx_usage_allocations_source ON public.usage_allocations(source);
CREATE INDEX idx_usage_allocations_ledger_source ON public.usage_allocations(usage_ledger_id, source);

-- Credit Ledger
CREATE INDEX idx_credit_ledger_tenant_id ON public.credit_ledger(tenant_id);
CREATE INDEX idx_credit_ledger_feature_id ON public.credit_ledger(feature_id);
CREATE INDEX idx_credit_ledger_tenant_recorded ON public.credit_ledger(tenant_id, recorded_at DESC);
CREATE INDEX idx_credit_ledger_usage_ledger_id ON public.credit_ledger(usage_ledger_id);
CREATE UNIQUE INDEX idx_credit_ledger_idempotency_key ON public.credit_ledger(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- Aggregated Usage
CREATE INDEX idx_aggregated_usage_tenant_id ON public.aggregated_usage(tenant_id);
CREATE INDEX idx_aggregated_usage_subscription_id ON public.aggregated_usage(subscription_id);
CREATE INDEX idx_aggregated_usage_feature_id ON public.aggregated_usage(feature_id);
CREATE INDEX idx_aggregated_usage_tenant_period ON public.aggregated_usage(tenant_id, billing_period);

-- Entitlement Snapshots
CREATE INDEX idx_entitlement_snapshots_tenant_id ON public.entitlement_snapshots(tenant_id);
CREATE INDEX idx_entitlement_snapshots_subscription_id ON public.entitlement_snapshots(subscription_id);

-- Domain Events
CREATE INDEX idx_domain_events_tenant_id ON public.domain_events(tenant_id, recorded_at DESC);
CREATE INDEX idx_domain_events_event_type ON public.domain_events(event_type, recorded_at DESC);
CREATE INDEX idx_domain_events_aggregate ON public.domain_events(aggregate_type, aggregate_id, sequence_number);
CREATE INDEX idx_domain_events_actor_id ON public.domain_events(actor_id);

-- =========================
-- TRIGGERS
-- =========================

-- Apply update_updated_at_column trigger to tables with updated_at
CREATE TRIGGER update_features_updated_at
    BEFORE UPDATE ON public.features
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_plans_updated_at
    BEFORE UPDATE ON public.plans
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_addons_updated_at
    BEFORE UPDATE ON public.addons
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_subscriptions_updated_at
    BEFORE UPDATE ON public.tenant_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_addons_updated_at
    BEFORE UPDATE ON public.tenant_addons
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tenant_overrides_updated_at
    BEFORE UPDATE ON public.tenant_overrides
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;

-- =========================
-- ROLLBACK SCRIPT
-- =========================
-- To rollback this migration, run the following:
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS update_tenant_overrides_updated_at ON public.tenant_overrides;
DROP TRIGGER IF EXISTS update_tenant_addons_updated_at ON public.tenant_addons;
DROP TRIGGER IF EXISTS update_tenant_subscriptions_updated_at ON public.tenant_subscriptions;
DROP TRIGGER IF EXISTS update_addons_updated_at ON public.addons;
DROP TRIGGER IF EXISTS update_plans_updated_at ON public.plans;
DROP TRIGGER IF EXISTS update_features_updated_at ON public.features;

-- Drop usage_allocations triggers
DROP TRIGGER IF EXISTS prevent_usage_allocations_delete ON public.usage_allocations;
DROP TRIGGER IF EXISTS prevent_usage_allocations_update ON public.usage_allocations;
DROP TRIGGER IF EXISTS validate_usage_allocations_sum_trigger ON public.usage_allocations;

-- Drop indexes
DROP INDEX IF EXISTS public.idx_domain_events_actor_id;
DROP INDEX IF EXISTS public.idx_domain_events_aggregate;
DROP INDEX IF EXISTS public.idx_domain_events_event_type;
DROP INDEX IF EXISTS public.idx_domain_events_tenant_id;
DROP INDEX IF EXISTS public.idx_entitlement_snapshots_subscription_id;
DROP INDEX IF EXISTS public.idx_entitlement_snapshots_tenant_id;
DROP INDEX IF EXISTS public.idx_entitlement_snapshots_active;
DROP INDEX IF EXISTS public.idx_aggregated_usage_tenant_period;
DROP INDEX IF EXISTS public.idx_aggregated_usage_feature_id;
DROP INDEX IF EXISTS public.idx_aggregated_usage_tenant_id;
DROP INDEX IF EXISTS public.idx_credit_ledger_usage_ledger_id;
DROP INDEX IF EXISTS public.idx_credit_ledger_tenant_recorded;
DROP INDEX IF EXISTS public.idx_credit_ledger_feature_id;
DROP INDEX IF EXISTS public.idx_credit_ledger_tenant_id;
DROP INDEX IF EXISTS public.idx_usage_allocations_ledger_source;
DROP INDEX IF EXISTS public.idx_usage_allocations_source;
DROP INDEX IF EXISTS public.idx_usage_allocations_ledger_id;
DROP INDEX IF EXISTS public.idx_usage_ledger_recorded_at;
DROP INDEX IF EXISTS public.idx_usage_ledger_tenant_feature_period;
DROP INDEX IF EXISTS public.idx_usage_ledger_feature_id;
DROP INDEX IF EXISTS public.idx_usage_ledger_tenant_id;
DROP INDEX IF EXISTS public.idx_tenant_overrides_tenant_active;
DROP INDEX IF EXISTS public.idx_tenant_overrides_feature_id;
DROP INDEX IF EXISTS public.idx_tenant_overrides_tenant_id;
DROP INDEX IF EXISTS public.idx_tenant_addons_tenant_active;
DROP INDEX IF EXISTS public.idx_tenant_addons_addon_id;
DROP INDEX IF EXISTS public.idx_tenant_addons_tenant_id;
DROP INDEX IF EXISTS public.idx_tenant_subscriptions_tenant_active_unique;
DROP INDEX IF EXISTS public.idx_tenant_subscriptions_tenant_active;
DROP INDEX IF EXISTS public.idx_tenant_subscriptions_status;
DROP INDEX IF EXISTS public.idx_tenant_subscriptions_plan_id;
DROP INDEX IF EXISTS public.idx_tenant_subscriptions_tenant_id;
DROP INDEX IF EXISTS public.idx_addon_entitlements_feature_id;
DROP INDEX IF EXISTS public.idx_addon_entitlements_addon_id;
DROP INDEX IF EXISTS public.idx_addons_is_active;
DROP INDEX IF EXISTS public.idx_addons_key;
DROP INDEX IF EXISTS public.idx_plan_entitlements_feature_id;
DROP INDEX IF EXISTS public.idx_plan_entitlements_plan_id;
DROP INDEX IF EXISTS public.idx_plans_sort_order;
DROP INDEX IF EXISTS public.idx_plans_is_active;
DROP INDEX IF EXISTS public.idx_plans_key;
DROP INDEX IF EXISTS public.idx_features_is_active;
DROP INDEX IF EXISTS public.idx_features_key;

-- Drop rules
DROP RULE IF EXISTS domain_events_no_delete ON public.domain_events;
DROP RULE IF EXISTS domain_events_no_update ON public.domain_events;
DROP RULE IF EXISTS credit_ledger_no_delete ON public.credit_ledger;
DROP RULE IF EXISTS credit_ledger_no_update ON public.credit_ledger;
DROP RULE IF EXISTS usage_ledger_no_delete ON public.usage_ledger;
DROP RULE IF EXISTS usage_ledger_no_update ON public.usage_ledger;

-- Drop functions
DROP FUNCTION IF EXISTS validate_usage_allocations_sum();

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS public.domain_events;
DROP TABLE IF EXISTS public.entitlement_snapshots;
DROP TABLE IF EXISTS public.aggregated_usage;
DROP TABLE IF EXISTS public.credit_ledger;
DROP TABLE IF EXISTS public.usage_allocations;
DROP TABLE IF EXISTS public.usage_ledger;
DROP TABLE IF EXISTS public.tenant_overrides;
DROP TABLE IF EXISTS public.tenant_addons;
DROP TABLE IF EXISTS public.tenant_subscriptions;
DROP TABLE IF EXISTS public.addon_entitlements;
DROP TABLE IF EXISTS public.addons;
DROP TABLE IF EXISTS public.plan_entitlements;
DROP TABLE IF EXISTS public.plans;
DROP TABLE IF EXISTS public.features;

-- Drop ENUMs
DROP TYPE IF EXISTS usage_source;
DROP TYPE IF EXISTS credit_transaction_type;
DROP TYPE IF EXISTS subscription_status;
DROP TYPE IF EXISTS feature_type;

COMMIT;
*/
