/**
 * Entitlement System Types
 *
 * Complete type definitions for the entitlement engine including features,
 * plans, subscriptions, usage tracking, credits, and domain events.
 */

import {
  CreditTransactionType,
  FeatureType,
  SubscriptionStatus,
  UsageSource,
} from '../constants/entitlement-constants';
import { FeatureKey, PlanKey } from '../constants/plan-entitlements.constant';

// Re-export derived types from constants (single source of truth)
export type {
  CreditTransactionType,
  FeatureType,
  SubscriptionStatus,
  UsageSource,
} from '../constants/entitlement-constants';
export type {
  FeatureKey,
  PlanKey,
} from '../constants/plan-entitlements.constant';

// =========================
// CATALOG ENTITIES
// =========================

export interface Feature {
  id: string;
  key: FeatureKey;
  name: string;
  description?: string;
  feature_type: FeatureType;
  unit?: string;
  creditable: boolean;
  credit_cost?: number | null; // Cost in credits per unit (NULL for non-creditable features)
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Plan {
  id: string;
  key: PlanKey;
  name: string;
  description?: string;
  price_monthly: number;
  price_currency: string;
  billing_period: string;
  is_active: boolean;
  sort_order: number;
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PlanEntitlement {
  id: string;
  plan_id: string;
  feature_id: string;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  created_at: Date;
}

export interface Addon {
  id: string;
  key: string;
  name: string;
  description?: string;
  price_monthly: number;
  price_currency: string;
  is_active: boolean;
  stripe_product_id?: string | null;
  stripe_price_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AddonEntitlement {
  id: string;
  addon_id: string;
  feature_id: string;
  feature_key: FeatureKey; // Feature key for O(1) lookup in getFeatureDefinition()
  feature_type: FeatureType;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  created_at: Date;
}

// =========================
// TENANT-SCOPED ENTITIES
// =========================

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: SubscriptionStatus;
  billing_period_start: Date;
  billing_period_end: Date;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at?: Date;
  trial_ends_at?: Date;
  /** Set when the "trial ending soon" reminder email was delivered. */
  trial_reminder_sent_at?: Date | null;
  metadata: Record<string, unknown>;
  billing_interval?: 'monthly' | 'annual' | null;
  cancel_at_period_end: boolean;
  downgraded_from_stripe: boolean;
  stripe_subscription_id?: string | null;
  stripe_schedule_id?: string | null;
  stripe_current_period_end?: Date | null;
  stripe_status?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantAddon {
  id: string;
  tenant_id: string;
  addon_id: string;
  quantity: number;
  status: string;
  starts_at: Date;
  expires_at?: Date;
  stripe_subscription_item_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantAddonWithEntitlements extends TenantAddon {
  entitlements: AddonEntitlement[];
  addon_key?: string; // Human-readable key like 'extra_documents_pack'
  addon_name?: string; // Display name
}

export interface TenantOverride {
  id: string;
  tenant_id: string;
  feature_id: string;
  feature_key: FeatureKey; // Feature key for O(1) lookup in getFeatureDefinition()
  feature_type: FeatureType;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  reason: string;
  applied_by: string;
  starts_at: Date;
  expires_at?: Date;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// =========================
// EVENT LEDGERS
// =========================

export interface UsageLedgerEvent {
  id: string;
  tenant_id: string;
  feature_id: string;
  user_id?: string;
  units: number;
  billing_period: string;
  resource_type?: string;
  resource_id?: string;
  metadata: Record<string, unknown>;
  idempotency_key?: string;
  recorded_at: Date;
  projected_at?: Date;
  voided_at?: Date;
}

export interface UsageAllocation {
  id: string;
  usage_ledger_id: string;
  source: UsageSource;
  units: number;
  created_at: Date;
}

export interface CreditLedgerTransaction {
  id: string;
  tenant_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number;
  feature_id?: string;
  usage_ledger_id?: string;
  reason?: string;
  applied_by?: string;
  expires_at?: Date;
  metadata: Record<string, unknown>;
  idempotency_key?: string;
  stripe_payment_intent_id?: string | null;
  recorded_at: Date;
}

// =========================
// PROJECTIONS
// =========================

export interface AggregatedUsage {
  id: string;
  tenant_id: string;
  subscription_id: string;
  feature_id: string;
  billing_period: string;
  total_units: number;
  plan_units: number;
  addon_units: number;
  credit_units: number;
  override_units: number;
  last_updated_at: Date;
}

export interface EntitlementSnapshot {
  id: string;
  tenant_id: string;
  snapshot_data: Record<string, EffectiveEntitlement>;
  subscription_id?: string;
  valid_from: Date;
  invalidated_at?: Date;
  created_at: Date;
}

// =========================
// DOMAIN EVENTS
// =========================

export interface DomainEvent {
  id: string;
  tenant_id?: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id?: string;
  actor_type: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  sequence_number?: number;
  recorded_at: Date;
}

// =========================
// BUSINESS LOGIC TYPES
// =========================

export interface EffectiveEntitlement {
  feature_key: FeatureKey;
  feature_type: FeatureType;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  source: UsageSource;
  creditable?: boolean;
  /** Set while the tenant is read-only because a payment is overdue past its grace period. */
  restricted?: 'payment_required';
}

export interface EntitlementCheckResult {
  allowed: boolean;
  source?: UsageSource; // Derived: primary source or 'mixed' for multi-source
  allocations?: Array<{ source: UsageSource; units: number }>; // Detailed breakdown
  remaining?: number;
  limit?: number;
  used?: number;
  reason?: string;
  creditsRemaining?: number;
  creditsDeducted?: number; // Total credits consumed (if credits were used)
  creditCostPerUnit?: number; // Cost per unit (for transparency)
}

export interface UsageRecordInput {
  tenant_id: string;
  feature_key: FeatureKey;
  feature_id?: string;
  user_id?: string;
  units: number;
  allocations: Array<{ source: Exclude<UsageSource, 'mixed'>; units: number }>;
  billing_period?: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

export interface CreditTransactionInput {
  tenant_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  feature_id?: string;
  usage_ledger_id?: string;
  reason?: string;
  applied_by?: string;
  expires_at?: Date;
  metadata?: Record<string, unknown>;
  idempotency_key?: string;
}

// =========================
// REPOSITORY INPUT TYPES
// =========================

// Features
export interface CreateFeatureRow {
  id?: string;
  key: FeatureKey;
  name: string;
  description?: string;
  feature_type: FeatureType;
  unit?: string;
  creditable?: boolean;
  credit_cost?: number | null; // Cost in credits per unit
  is_active?: boolean;
}

export interface UpdateFeatureRow {
  name?: string;
  description?: string;
  feature_type?: FeatureType;
  unit?: string;
  creditable?: boolean;
  credit_cost?: number | null; // Cost in credits per unit
  is_active?: boolean;
}

// Plans
export interface CreatePlanRow {
  id?: string;
  key: PlanKey;
  name: string;
  description?: string;
  price_monthly?: number;
  price_currency?: string;
  billing_period?: string;
  is_active?: boolean;
  sort_order?: number;
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
}

export interface UpdatePlanRow {
  name?: string;
  description?: string;
  price_monthly?: number;
  price_currency?: string;
  billing_period?: string;
  is_active?: boolean;
  sort_order?: number;
  stripe_product_id?: string | null;
  stripe_price_id_monthly?: string | null;
  stripe_price_id_annual?: string | null;
}

// Plan Entitlements
export interface CreatePlanEntitlementRow {
  id?: string;
  plan_id: string;
  feature_id: string;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
}

export interface UpdatePlanEntitlementRow {
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
}

// Tenant Subscriptions
export interface CreateTenantSubscriptionRow {
  id?: string;
  tenant_id: string;
  plan_id: string;
  status?: SubscriptionStatus;
  billing_period_start: Date;
  billing_period_end: Date;
  current_period_start: Date;
  current_period_end: Date;
  cancelled_at?: Date;
  trial_ends_at?: Date;
  metadata?: string; // Stringified JSON
  billing_interval?: 'monthly' | 'annual' | null;
  cancel_at_period_end?: boolean;
  downgraded_from_stripe?: boolean;
  stripe_subscription_id?: string | null;
  stripe_schedule_id?: string | null;
  stripe_current_period_end?: Date | null;
  stripe_status?: string | null;
}

export interface UpdateTenantSubscriptionRow {
  plan_id?: string;
  status?: SubscriptionStatus;
  billing_period_end?: Date;
  current_period_start?: Date;
  current_period_end?: Date;
  cancelled_at?: Date | null;
  metadata?: string; // Stringified JSON
  billing_interval?: 'monthly' | 'annual' | null;
  cancel_at_period_end?: boolean;
  downgraded_from_stripe?: boolean;
  stripe_subscription_id?: string | null;
  stripe_schedule_id?: string | null;
  stripe_current_period_end?: Date | null;
  stripe_status?: string | null;
}

// Tenant Addons
export interface CreateTenantAddonRow {
  id?: string;
  tenant_id: string;
  addon_id: string;
  quantity?: number;
  status?: string;
  starts_at?: Date;
  expires_at?: Date;
  stripe_subscription_item_id?: string | null;
}

export interface UpdateTenantAddonRow {
  quantity?: number;
  status?: string;
  expires_at?: Date;
  stripe_subscription_item_id?: string | null;
}

// Tenant Overrides
export interface CreateTenantOverrideRow {
  id?: string;
  tenant_id: string;
  feature_id: string;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  reason: string;
  applied_by: string;
  starts_at?: Date;
  expires_at?: Date;
  is_active?: boolean;
}

export interface UpdateTenantOverrideRow {
  value_bool?: boolean | null;
  value_int?: number | null;
  value_text?: string | null;
  reason?: string;
  expires_at?: Date;
  is_active?: boolean;
}

// Usage Ledger (append-only)
export interface CreateUsageLedgerRow {
  id?: string;
  tenant_id: string;
  feature_id: string;
  user_id?: string;
  units: number;
  billing_period: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: string; // Stringified JSON
  idempotency_key?: string;
}

// Usage Allocations (append-only)
export interface CreateUsageAllocationRow {
  id?: string;
  usage_ledger_id: string;
  source: UsageSource;
  units: number;
}

// Credit Ledger (append-only)
export interface CreateCreditLedgerRow {
  id?: string;
  tenant_id: string;
  transaction_type: CreditTransactionType;
  amount: number;
  balance_after: number;
  feature_id?: string;
  usage_ledger_id?: string;
  reason?: string;
  applied_by?: string;
  expires_at?: Date;
  metadata?: string; // Stringified JSON
  idempotency_key?: string;
  stripe_payment_intent_id?: string | null;
}

// Aggregated Usage
export interface CreateAggregatedUsageRow {
  id?: string;
  tenant_id: string;
  subscription_id: string;
  feature_id: string;
  billing_period: string;
  total_units?: number;
  plan_units?: number;
  addon_units?: number;
  credit_units?: number;
  override_units?: number;
}

export interface UpdateAggregatedUsageRow {
  total_units?: number;
  plan_units?: number;
  addon_units?: number;
  credit_units?: number;
  override_units?: number;
}

// Entitlement Snapshots
export interface CreateEntitlementSnapshotRow {
  id?: string;
  tenant_id: string;
  snapshot_data: string; // Stringified JSON
  subscription_id?: string;
  valid_from?: Date;
}

export interface UpdateEntitlementSnapshotRow {
  invalidated_at?: Date;
}

// Domain Events (append-only)
export interface CreateDomainEventRow {
  id?: string;
  tenant_id?: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  actor_id?: string;
  actor_type?: string;
  payload: string; // Stringified JSON
  metadata?: string; // Stringified JSON
  sequence_number?: number;
}

// =========================
// HELPER TYPES
// =========================

export interface PlanWithEntitlements extends Plan {
  entitlements: PlanEntitlement[];
}

export type ResolvedEntitlements = Record<FeatureKey, EffectiveEntitlement>;

// =========================
// DOMAIN EVENT FILTERS (Phase 7)
// =========================

export interface DomainEventFilters {
  eventType?: string; // Filter by event_type (e.g., 'usage.recorded', 'credit.*')
  aggregateType?: string; // Filter by aggregate_type (e.g., 'usage', 'credit', 'subscription')
  fromDate?: Date; // Filter by recorded_at >= fromDate
  toDate?: Date; // Filter by recorded_at <= toDate
  limit?: number; // Pagination limit (default 50)
  offset?: number; // Pagination offset (default 0)
}

export interface DomainEventSummary {
  event_type: string;
  count: number;
}

// =========================
// SNAPSHOT TYPES (Phase 8)
// =========================

export interface SnapshotWithPlan {
  snapshot: EntitlementSnapshot;
  plan_key: PlanKey;
  plan_name: string;
}

export interface SnapshotComparison {
  fromSnapshot: ResolvedEntitlements;
  fromCompute: ResolvedEntitlements;
  snapshotTimeMs: number;
  computeTimeMs: number;
  speedup: string; // e.g., "3.2x faster"
}

// === Enforcement Service Inputs ===

export interface BaseEnforcementFields {
  tenantId: string;
  featureKey: FeatureKey;
  userId?: string;
}

export interface CheckAndRecordInput extends BaseEnforcementFields {
  units?: number;
  metadata?: Record<string, unknown>;
}

export interface EnforceUsageBasedInput extends BaseEnforcementFields {
  entitlement: EffectiveEntitlement;
  units: number;
  metadata?: Record<string, unknown>;
}

export interface EnforcementContext extends BaseEnforcementFields {
  units: number;
  metadata?: Record<string, unknown>;
  subscription: { id: string };
  feature: {
    id: string;
    name: string;
    feature_type: string;
    credit_cost?: number | null;
  };
  billingPeriod: string;
}

export interface EnforceUsageLimitedInput extends EnforcementContext {
  limit: number;
  used: number;
}

export interface EnforceUsageUnlimitedInput extends EnforcementContext {
  used: number;
}

export interface WriteUsageAndCreditsInput extends BaseEnforcementFields {
  units: number;
  metadata?: Record<string, unknown>;
  feature: {
    id: string;
    name: string;
    feature_type: string;
    credit_cost?: number | null;
  };
  billingPeriod: string;
  allocationResolution: AllocationResolution;
}

export interface AllocationResolution {
  mode: 'within_quota' | 'credit_fallback';
  allocations: Array<{ source: 'plan' | 'credit'; units: number }>;
  creditUnits: number;
  creditCost: number;
  creditCostPerUnit: number;
  creditBalance?: number;
}

export interface ResolveAllocationsInput extends BaseEnforcementFields {
  units: number;
  limit: number;
  used: number;
  featureCreditCost?: number | null;
}

export interface BuildProjectionJobInput extends BaseEnforcementFields {
  usageEvent: {
    id: string;
    resource_type?: string;
    resource_id?: string;
    recorded_at: Date;
    idempotency_key?: string;
  };
  feature: { id: string; name: string; feature_type: string };
  subscription: { id: string };
  billingPeriod: string;
  allocations: Array<{
    source: 'plan' | 'addon' | 'credit' | 'override';
    units: number;
  }>;
  creditDeducted?: boolean;
  creditAmount?: number;
}

export interface EmitDenialEventInput extends BaseEnforcementFields {
  units: number;
  limit: number;
  used: number;
  reason: string;
}

export interface UsageWriteResult {
  usageEvent: UsageLedgerEvent;
  planUnits: number;
}

// === Credit Ledger Service Inputs ===

export interface CreditPurchaseInput {
  tenantId: string;
  amount: number;
  metadata?: Record<string, unknown>;
  /** Makes the purchase idempotent: a second purchase with the same key returns the first. */
  idempotencyKey?: string;
  stripePaymentIntentId?: string | null;
}

export interface CreditGrantInput {
  tenantId: string;
  amount: number;
  reason: string;
  expiresAt?: Date;
  appliedBy?: string;
  metadata?: Record<string, unknown>;
}

export interface CreditDeductInput {
  tenantId: string;
  amount: number;
  featureId?: string;
  usageLedgerId?: string;
  metadata?: Record<string, unknown>;
}

export interface CreditRefundInput {
  tenantId: string;
  amount: number;
  reason: string;
  metadata?: Record<string, unknown>;
}

export interface RecordTransactionInput {
  tenantId: string;
  transactionType: CreditTransactionType;
  amount: number;
  featureId?: string;
  usageLedgerId?: string;
  reason?: string;
  appliedBy?: string;
  expiresAt?: Date;
  metadata?: Record<string, unknown>;
  idempotencyKey?: string;
  stripePaymentIntentId?: string | null;
  /** Only for reversals: the balance may go below zero (spending is then refused). */
  allowNegative?: boolean;
}

// === Usage Projection / Repository Inputs ===

// For incrementUsage() and AggregatedUsageRepository.increment()
export interface IncrementUsageInput {
  tenantId: string;
  subscriptionId: string;
  featureId: string;
  billingPeriod: string;
  allocations: Array<{ source: Exclude<UsageSource, 'mixed'>; units: number }>;
}

// For AggregatedUsageRepository.conditionalIncrement()
export interface ConditionalIncrementInput extends IncrementUsageInput {
  limit: number;
}
