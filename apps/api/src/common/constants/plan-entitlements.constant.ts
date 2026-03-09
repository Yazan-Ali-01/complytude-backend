/**
 * Plan Entitlements Constants
 *
 * Source of truth for feature catalog and plan-feature matrix.
 * Synced to database on app startup via EntitlementSyncService.
 *
 * Pattern follows tenant-system-roles.constant.ts (RBAC system).
 */

import { FeatureKey, FeatureType, PlanKey } from '../types/entitlement.types';
import { DEFAULT_CURRENCY } from './billing.constant';

// =========================
// FEATURE DEFINITIONS
// =========================

export type FeatureStorageType = 'bool' | 'int' | 'text';

export interface FeatureDefinition {
  key: FeatureKey;
  name: string;
  feature_type: FeatureType;
  /**
   * Which DB column stores this feature's value.
   * Needed because feature_type:'boolean' is used for both simple on/off features
   * (stored in value_bool) and tiered string features (stored in value_text).
   */
  storage_type: FeatureStorageType;
  unit?: string;
  creditable?: boolean;
  credit_cost?: number | null; // Cost in credits per unit (null for non-creditable features)
  description?: string;
}

/**
 * Complete feature catalog (source of truth).
 * Synced to public.features table on app startup.
 */
export const ALL_FEATURES: FeatureDefinition[] = [
  {
    key: 'documents_per_month',
    name: 'Documents Per Month',
    feature_type: 'quota',
    storage_type: 'int',
    unit: 'documents',
    creditable: true,
    credit_cost: 5, // 5 credits per document
    description: 'Number of documents that can be generated per billing period',
  },
  {
    key: 'template_library',
    name: 'Template Library',
    feature_type: 'boolean',
    storage_type: 'text', // tiered: 'essential' | 'full'
    description: 'Access to template library (essential or full)',
  },
  {
    key: 'bilingual_quality',
    name: 'Bilingual Quality',
    feature_type: 'boolean',
    storage_type: 'text', // tiered: 'standard' | 'jais_native'
    description:
      'Quality of bilingual document generation (standard or jais_native)',
  },
  {
    key: 'contract_reviews_per_month',
    name: 'Contract Reviews Per Month',
    feature_type: 'quota',
    storage_type: 'int',
    unit: 'reviews',
    creditable: false,
    description: 'Number of AI contract reviews per billing period',
  },
  {
    key: 'risk_analysis_level',
    name: 'Risk Analysis Level',
    feature_type: 'boolean',
    storage_type: 'text', // tiered: 'none' | 'critical_only' | 'full'
    description: 'Level of risk analysis (none, critical_only, or full)',
  },
  {
    key: 'redlining_enabled',
    name: 'AI Redlining',
    feature_type: 'boolean',
    storage_type: 'bool',
    description: 'AI suggests alternative compliant wording',
  },
  {
    key: 'localizer_check',
    name: 'Localizer Check',
    feature_type: 'boolean',
    storage_type: 'bool',
    description: 'Flags governing law / jurisdiction mismatches',
  },
  {
    key: 'regulatory_hub_access',
    name: 'Regulatory Hub Access',
    feature_type: 'boolean',
    storage_type: 'bool',
    description: 'Access to compliance dashboard',
  },
  {
    key: 'regulatory_queries_per_month',
    name: 'Regulatory Queries',
    feature_type: 'quota',
    storage_type: 'int',
    unit: 'queries',
    creditable: true,
    credit_cost: 3, // 3 credits per query
    description: 'Chat-with-Law queries per billing period',
  },
  {
    key: 'license_verifier_lookups',
    name: 'License Verifier Lookups',
    feature_type: 'quota',
    storage_type: 'int',
    unit: 'lookups',
    creditable: false,
    description: 'DED API lookups per billing period',
  },
  {
    key: 'jurisdictions',
    name: 'Jurisdictions',
    feature_type: 'boolean',
    storage_type: 'text', // tiered: 'single' | 'all'
    description: 'Access to jurisdictions (single or all)',
  },
  {
    key: 'user_seats',
    name: 'User Seats',
    feature_type: 'capacity',
    storage_type: 'int',
    unit: 'seats',
    description: 'Maximum number of users in tenant',
  },
  {
    key: 'data_isolation',
    name: 'Data Isolation',
    feature_type: 'boolean',
    storage_type: 'text', // tiered: 'shared' | 'row_level' | 'silo'
    description: 'Level of data isolation (shared, row_level, or silo)',
  },
  {
    key: 'custom_playbooks',
    name: 'Custom Playbooks',
    feature_type: 'boolean',
    storage_type: 'bool',
    description: 'Upload company-specific negotiating positions',
  },
  {
    key: 'white_label_exports',
    name: 'White Label Exports',
    feature_type: 'boolean',
    storage_type: 'bool',
    description: 'Export reports with tenant branding',
  },
];

// =========================
// PLAN DEFINITIONS
// =========================

export interface PlanDefinition {
  key: PlanKey;
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
 */
export const ALL_PLANS: PlanDefinition[] = [
  {
    key: 'navigator',
    name: 'Navigator',
    description: 'Lead magnet — Regulatory Watch + basic Chat with Law',
    price_monthly: 0,
    price_currency: DEFAULT_CURRENCY,
    billing_period: 'monthly',
    sort_order: 1,
  },
  {
    key: 'shield',
    name: 'Shield',
    description: 'Solo entrepreneurs — Essential templates + basic analysis',
    price_monthly: 349,
    price_currency: DEFAULT_CURRENCY,
    billing_period: 'monthly',
    sort_order: 2,
  },
  {
    key: 'general_counsel',
    name: 'General Counsel',
    description: 'Active SMEs — Full library + Jais-native Arabic + redlining',
    price_monthly: 599,
    price_currency: DEFAULT_CURRENCY,
    billing_period: 'monthly',
    sort_order: 3,
  },
  {
    key: 'infrastructure',
    name: 'Infrastructure',
    description: 'Agencies — Silo isolation + custom playbooks + white-label',
    price_monthly: 2499,
    price_currency: DEFAULT_CURRENCY,
    billing_period: 'monthly',
    sort_order: 4,
  },
];

// =========================
// PLAN ENTITLEMENTS
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

/**
 * Helper: Get entitlement value for a plan and feature (O(1) lookup)
 */
export function getPlanEntitlement(
  planKey: PlanKey,
  featureKey: FeatureKey,
): PlanEntitlementValue | undefined {
  return PLAN_ENTITLEMENTS[planKey]?.[featureKey];
}

/**
 * Helper: Get all entitlements for a plan
 */
export function getAllPlanEntitlements(
  planKey: PlanKey,
): Record<FeatureKey, PlanEntitlementValue> {
  return PLAN_ENTITLEMENTS[planKey] ?? {};
}

/**
 * Helper: Check if a feature key exists in the catalog
 */
export function isValidFeatureKey(
  featureKey: string,
): featureKey is FeatureKey {
  return ALL_FEATURES.some((f) => f.key === featureKey);
}

/**
 * Helper: Get feature definition by key
 */
export function getFeatureDefinition(
  featureKey: FeatureKey,
): FeatureDefinition | undefined {
  return ALL_FEATURES.find((f) => f.key === featureKey);
}

/**
 * Helper: Get the DB storage type for a feature key.
 * Throws if the feature key is unknown (programmer error).
 */
export function getFeatureStorageType(
  featureKey: FeatureKey,
): FeatureStorageType {
  const feature = ALL_FEATURES.find((f) => f.key === featureKey);
  if (!feature) {
    throw new Error(`Unknown feature key: ${featureKey}`);
  }
  return feature.storage_type;
}
