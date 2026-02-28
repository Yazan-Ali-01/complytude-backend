/**
 * Plan Entitlements Constants
 *
 * Source of truth for feature catalog and plan-feature matrix.
 * Synced to database on app startup via EntitlementSyncService.
 *
 * Pattern follows tenant-system-roles.constant.ts (RBAC system).
 *
 * ARCHITECTURE:
 * - FEATURE_CATALOG: Keyed object (O(1) lookup by feature key)
 * - PLAN_CATALOG: Keyed object (O(1) lookup by plan key)
 * - FeatureKey, PlanKey: Derived types from object keys (auto-update)
 */

import { FeatureType } from './entitlement-constants';

// =========================
// FEATURE CATALOG
// =========================

/**
 * Feature catalog entry (without key field - key is the object key)
 */
export interface FeatureCatalogEntry {
  name: string;
  feature_type: FeatureType;
  unit?: string;
  creditable?: boolean;
  credit_cost?: number | null; // Cost in credits per unit (null for non-creditable features)
  description?: string;
}

/**
 * Complete feature catalog (source of truth).
 * Synced to public.features table on app startup.
 *
 * Key is the feature identifier (e.g., 'documents_per_month')
 * Value contains feature metadata
 *
 * Pattern: Object keys ARE the feature keys → type derived automatically
 */
export const FEATURE_CATALOG = {
  documents_per_month: {
    name: 'Documents Per Month',
    feature_type: 'quota' as const,
    unit: 'documents',
    creditable: true,
    credit_cost: 5, // 5 credits per document
    description: 'Number of documents that can be generated per billing period',
  },
  template_library: {
    name: 'Template Library',
    feature_type: 'boolean' as const,
    description: 'Access to template library (essential or full)',
  },
  bilingual_quality: {
    name: 'Bilingual Quality',
    feature_type: 'boolean' as const,
    description:
      'Quality of bilingual document generation (standard or jais_native)',
  },
  contract_reviews_per_month: {
    name: 'Contract Reviews Per Month',
    feature_type: 'quota' as const,
    unit: 'reviews',
    creditable: false,
    description: 'Number of AI contract reviews per billing period',
  },
  risk_analysis_level: {
    name: 'Risk Analysis Level',
    feature_type: 'boolean' as const,
    description: 'Level of risk analysis (none, critical_only, or full)',
  },
  redlining_enabled: {
    name: 'AI Redlining',
    feature_type: 'boolean' as const,
    description: 'AI suggests alternative compliant wording',
  },
  localizer_check: {
    name: 'Localizer Check',
    feature_type: 'boolean' as const,
    description: 'Flags governing law / jurisdiction mismatches',
  },
  regulatory_hub_access: {
    name: 'Regulatory Hub Access',
    feature_type: 'boolean' as const,
    description: 'Access to compliance dashboard',
  },
  regulatory_queries_per_month: {
    name: 'Regulatory Queries',
    feature_type: 'quota' as const,
    unit: 'queries',
    creditable: true,
    credit_cost: 3, // 3 credits per query
    description: 'Chat-with-Law queries per billing period',
  },
  license_verifier_lookups: {
    name: 'License Verifier Lookups',
    feature_type: 'quota' as const,
    unit: 'lookups',
    creditable: false,
    description: 'DED API lookups per billing period',
  },
  jurisdictions: {
    name: 'Jurisdictions',
    feature_type: 'boolean' as const,
    description: 'Access to jurisdictions (single or all)',
  },
  user_seats: {
    name: 'User Seats',
    feature_type: 'capacity' as const,
    unit: 'seats',
    description: 'Maximum number of users in tenant',
  },
  data_isolation: {
    name: 'Data Isolation',
    feature_type: 'boolean' as const,
    description: 'Level of data isolation (shared, row_level, or silo)',
  },
  custom_playbooks: {
    name: 'Custom Playbooks',
    feature_type: 'boolean' as const,
    description: 'Upload company-specific negotiating positions',
  },
  white_label_exports: {
    name: 'White Label Exports',
    feature_type: 'boolean' as const,
    description: 'Export reports with tenant branding',
  },
} satisfies Record<string, FeatureCatalogEntry>;

/**
 * Feature key type - derived from FEATURE_CATALOG keys
 * Add a key to FEATURE_CATALOG → type updates automatically
 */
export type FeatureKey = keyof typeof FEATURE_CATALOG;

// =========================
// PLAN CATALOG
// =========================

/**
 * Plan catalog entry (without key field - key is the object key)
 */
export interface PlanCatalogEntry {
  name: string;
  description: string;
  price_monthly: number;
  price_currency: string;
  billing_period: string;
  sort_order: number;
}

/**
 * Plan catalog (source of truth).
 * Synced to public.plans table on app startup.
 *
 * Key is the plan identifier (e.g., 'navigator', 'shield')
 * Value contains plan metadata
 *
 * Pattern: Object keys ARE the plan keys → type derived automatically
 */
export const PLAN_CATALOG = {
  navigator: {
    name: 'Navigator',
    description: 'Lead magnet — Regulatory Watch + basic Chat with Law',
    price_monthly: 0,
    price_currency: 'AED',
    billing_period: 'monthly',
    sort_order: 1,
  },
  shield: {
    name: 'Shield',
    description: 'Solo entrepreneurs — Essential templates + basic analysis',
    price_monthly: 249,
    price_currency: 'AED',
    billing_period: 'monthly',
    sort_order: 2,
  },
  general_counsel: {
    name: 'General Counsel',
    description: 'Active SMEs — Full library + Jais-native Arabic + redlining',
    price_monthly: 599,
    price_currency: 'AED',
    billing_period: 'monthly',
    sort_order: 3,
  },
  infrastructure: {
    name: 'Infrastructure',
    description: 'Agencies — Silo isolation + custom playbooks + white-label',
    price_monthly: 2499,
    price_currency: 'AED',
    billing_period: 'monthly',
    sort_order: 4,
  },
} satisfies Record<string, PlanCatalogEntry>;

/**
 * Plan key type - derived from PLAN_CATALOG keys
 * Add a key to PLAN_CATALOG → type updates automatically
 */
export type PlanKey = keyof typeof PLAN_CATALOG;

// =========================
// PLAN ENTITLEMENTS MATRIX
// =========================

export interface PlanEntitlementValue {
  value_bool?: boolean;
  value_int?: number; // -1 = unlimited
  value_text?: string; // for tiered: 'essential', 'full', 'jais_native', etc.
}

/**
 * Plan-feature matrix (source of truth).
 * Synced to public.plan_entitlements table on app startup.
 *
 * This is the in-memory lookup used by EntitlementResolverService for O(1) performance.
 *
 * Type-safe: PlanKey and FeatureKey are derived from catalogs
 */
export const PLAN_ENTITLEMENTS: Record<
  PlanKey,
  Record<FeatureKey, PlanEntitlementValue>
> = {
  navigator: {
    documents_per_month: { value_int: 3 },
    template_library: { value_text: 'essential' },
    bilingual_quality: { value_text: 'standard' },
    contract_reviews_per_month: { value_int: 0 },
    risk_analysis_level: { value_text: 'none' },
    redlining_enabled: { value_bool: false },
    localizer_check: { value_bool: false },
    regulatory_hub_access: { value_bool: true },
    regulatory_queries_per_month: { value_int: 5 },
    license_verifier_lookups: { value_int: 0 },
    jurisdictions: { value_text: 'single' },
    user_seats: { value_int: 1 },
    data_isolation: { value_text: 'shared' },
    custom_playbooks: { value_bool: false },
    white_label_exports: { value_bool: false },
  },
  shield: {
    documents_per_month: { value_int: 25 },
    template_library: { value_text: 'essential' },
    bilingual_quality: { value_text: 'standard' },
    contract_reviews_per_month: { value_int: 5 },
    risk_analysis_level: { value_text: 'critical_only' },
    redlining_enabled: { value_bool: false },
    localizer_check: { value_bool: false },
    regulatory_hub_access: { value_bool: true },
    regulatory_queries_per_month: { value_int: 20 },
    license_verifier_lookups: { value_int: 5 },
    jurisdictions: { value_text: 'single' },
    user_seats: { value_int: 3 },
    data_isolation: { value_text: 'shared' },
    custom_playbooks: { value_bool: false },
    white_label_exports: { value_bool: false },
  },
  general_counsel: {
    documents_per_month: { value_int: 100 },
    template_library: { value_text: 'full' },
    bilingual_quality: { value_text: 'jais_native' },
    contract_reviews_per_month: { value_int: 30 },
    risk_analysis_level: { value_text: 'full' },
    redlining_enabled: { value_bool: true },
    localizer_check: { value_bool: true },
    regulatory_hub_access: { value_bool: true },
    regulatory_queries_per_month: { value_int: 100 },
    license_verifier_lookups: { value_int: 20 },
    jurisdictions: { value_text: 'all' },
    user_seats: { value_int: 10 },
    data_isolation: { value_text: 'row_level' },
    custom_playbooks: { value_bool: false },
    white_label_exports: { value_bool: false },
  },
  infrastructure: {
    documents_per_month: { value_int: -1 }, // unlimited
    template_library: { value_text: 'full' },
    bilingual_quality: { value_text: 'jais_native' },
    contract_reviews_per_month: { value_int: -1 }, // unlimited
    risk_analysis_level: { value_text: 'full' },
    redlining_enabled: { value_bool: true },
    localizer_check: { value_bool: true },
    regulatory_hub_access: { value_bool: true },
    regulatory_queries_per_month: { value_int: -1 }, // unlimited
    license_verifier_lookups: { value_int: -1 }, // unlimited
    jurisdictions: { value_text: 'all' },
    user_seats: { value_int: -1 }, // unlimited
    data_isolation: { value_text: 'silo' },
    custom_playbooks: { value_bool: true },
    white_label_exports: { value_bool: true },
  },
};

// =========================
// HELPER FUNCTIONS (O(1) Lookups)
// =========================

/**
 * Get entitlement value for a plan and feature (O(1) lookup)
 */
export function getPlanEntitlement(
  planKey: PlanKey,
  featureKey: FeatureKey,
): PlanEntitlementValue | undefined {
  return PLAN_ENTITLEMENTS[planKey]?.[featureKey];
}

/**
 * Get all entitlements for a plan (O(1) lookup)
 */
export function getAllPlanEntitlements(
  planKey: PlanKey,
): Record<FeatureKey, PlanEntitlementValue> {
  return PLAN_ENTITLEMENTS[planKey] ?? {};
}

/**
 * Check if a feature key exists in the catalog (O(1) lookup)
 */
export function isValidFeatureKey(
  featureKey: string,
): featureKey is FeatureKey {
  return featureKey in FEATURE_CATALOG;
}

/**
 * Get feature definition by key (O(1) lookup)
 * Returns the feature entry with the key included
 */
export function getFeatureDefinition(
  featureKey: FeatureKey,
): FeatureCatalogEntry & { key: FeatureKey } {
  return {
    key: featureKey,
    ...FEATURE_CATALOG[featureKey],
  };
}

/**
 * Get feature definition without key field (O(1) lookup)
 * Use when you only need the entry data
 */
export function getFeatureEntry(featureKey: FeatureKey): FeatureCatalogEntry {
  return FEATURE_CATALOG[featureKey];
}

/**
 * Get plan definition by key (O(1) lookup)
 * Returns the plan entry with the key included
 */
export function getPlanDefinition(
  planKey: PlanKey,
): PlanCatalogEntry & { key: PlanKey } {
  return {
    key: planKey,
    ...PLAN_CATALOG[planKey],
  };
}

/**
 * Get plan definition without key field (O(1) lookup)
 * Use when you only need the entry data
 */
export function getPlanEntry(planKey: PlanKey): PlanCatalogEntry {
  return PLAN_CATALOG[planKey];
}

/**
 * Get all feature keys as array
 */
export function getAllFeatureKeys(): FeatureKey[] {
  return Object.keys(FEATURE_CATALOG) as FeatureKey[];
}

/**
 * Get all plan keys as array
 */
export function getAllPlanKeys(): PlanKey[] {
  return Object.keys(PLAN_CATALOG) as PlanKey[];
}

/**
 * Get all features with keys (for iteration)
 */
export function getAllFeaturesWithKeys(): Array<
  FeatureCatalogEntry & { key: FeatureKey }
> {
  return Object.entries(FEATURE_CATALOG).map(([key, entry]) => ({
    key: key as FeatureKey,
    ...entry,
  }));
}

/**
 * Get all plans with keys (for iteration)
 */
export function getAllPlansWithKeys(): Array<
  PlanCatalogEntry & { key: PlanKey }
> {
  return Object.entries(PLAN_CATALOG).map(([key, entry]) => ({
    key: key as PlanKey,
    ...entry,
  }));
}
