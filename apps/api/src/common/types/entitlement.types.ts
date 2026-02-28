/**
 * Entitlement System Types
 *
 * Complete type definitions for the entitlement engine including features,
 * plans, subscriptions, usage tracking, credits, and domain events.
 */

// =========================
// ENUMS
// =========================

export type FeatureType =
  | 'boolean'
  | 'quota'
  | 'metered'
  | 'capacity'
  | 'rate_limit';

export type FeatureKey =
  | 'documents_per_month'
  | 'template_library'
  | 'bilingual_quality'
  | 'contract_reviews_per_month'
  | 'risk_analysis_level'
  | 'redlining_enabled'
  | 'localizer_check'
  | 'regulatory_hub_access'
  | 'regulatory_queries_per_month'
  | 'license_verifier_lookups'
  | 'jurisdictions'
  | 'user_seats'
  | 'data_isolation'
  | 'custom_playbooks'
  | 'white_label_exports';

export type PlanKey =
  | 'navigator'
  | 'shield'
  | 'general_counsel'
  | 'infrastructure';
export type UsageSource = 'plan' | 'addon' | 'credit' | 'override' | 'mixed';
export type SubscriptionStatus =
  | 'active'
  | 'cancelled'
  | 'past_due'
  | 'trialing';
export type CreditTransactionType =
  | 'purchase'
  | 'grant'
  | 'deduction'
  | 'expiry'
  | 'refund';

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
  metadata: Record<string, any>;
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
  metadata: Record<string, any>;
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
  metadata: Record<string, any>;
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
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface AddonEntitlement {
  id: string;
  addon_id: string;
  feature_id: string;
  feature_key: FeatureKey; // Feature key for O(1) lookup in getFeatureDefinition()
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  metadata: Record<string, any>;
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
  metadata: Record<string, any>;
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
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface TenantOverride {
  id: string;
  tenant_id: string;
  feature_id: string;
  feature_key: FeatureKey; // Feature key for O(1) lookup in getFeatureDefinition()
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
  metadata: Record<string, any>;
  idempotency_key?: string;
  recorded_at: Date;
  projected_at?: Date;
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
  metadata: Record<string, any>;
  idempotency_key?: string;
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
  payload: Record<string, any>;
  metadata: Record<string, any>;
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
  metadata?: Record<string, any>;
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
  metadata?: Record<string, any>;
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
  metadata?: string; // Stringified JSON
}

export interface UpdateFeatureRow {
  name?: string;
  description?: string;
  feature_type?: FeatureType;
  unit?: string;
  creditable?: boolean;
  credit_cost?: number | null; // Cost in credits per unit
  is_active?: boolean;
  metadata?: string; // Stringified JSON
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
  metadata?: string; // Stringified JSON
}

export interface UpdatePlanRow {
  name?: string;
  description?: string;
  price_monthly?: number;
  price_currency?: string;
  billing_period?: string;
  is_active?: boolean;
  sort_order?: number;
  metadata?: string; // Stringified JSON
}

// Plan Entitlements
export interface CreatePlanEntitlementRow {
  id?: string;
  plan_id: string;
  feature_id: string;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  metadata?: string; // Stringified JSON
}

export interface UpdatePlanEntitlementRow {
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  metadata?: string; // Stringified JSON
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
  metadata?: string; // Stringified JSON
}

export interface UpdateTenantSubscriptionRow {
  plan_id?: string;
  status?: SubscriptionStatus;
  billing_period_end?: Date;
  current_period_start?: Date;
  current_period_end?: Date;
  cancelled_at?: Date;
  metadata?: string; // Stringified JSON
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
  metadata?: string; // Stringified JSON
}

export interface UpdateTenantAddonRow {
  quantity?: number;
  status?: string;
  expires_at?: Date;
  metadata?: string; // Stringified JSON
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
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
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

export interface TenantAddonWithEntitlements extends TenantAddon {
  entitlements: AddonEntitlement[];
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
