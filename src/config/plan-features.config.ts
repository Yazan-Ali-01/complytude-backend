import { TenantFeatures } from '../modules/tenant/entities/tenant.entity';

/**
 * Default feature configurations for each subscription plan
 * Custom tenant features in the database will override these defaults
 */
export const PLAN_FEATURES: Record<
  'early_access' | 'basic' | 'pro' | 'enterprise',
  TenantFeatures
> = {
  early_access: {
    document_limit: 10,
    checklist_access: false,
    analyzer_enabled: false,
  },
  basic: {
    document_limit: 50,
    checklist_access: true,
    analyzer_enabled: false,
  },
  pro: {
    document_limit: 500,
    checklist_access: true,
    analyzer_enabled: true,
  },
  enterprise: {
    document_limit: -1, // -1 means unlimited
    checklist_access: true,
    analyzer_enabled: true,
  },
};

/**
 * Get default features for a given plan
 */
export function getDefaultPlanFeatures(
  plan: 'early_access' | 'basic' | 'pro' | 'enterprise',
): TenantFeatures {
  return { ...PLAN_FEATURES[plan] };
}

/**
 * Check if a plan is valid
 */
export function isValidPlan(
  plan: string,
): plan is 'early_access' | 'basic' | 'pro' | 'enterprise' {
  return plan in PLAN_FEATURES;
}
