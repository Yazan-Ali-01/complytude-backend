/**
 * New subscription plan tiers (UAE Legal AI Platform)
 */
export type PlanTier =
  | 'navigator'
  | 'shield'
  | 'general_counsel'
  | 'infrastructure';

/**
 * Legacy plan types (for backward compatibility during migration)
 * @deprecated Use PlanTier instead
 */
export type LegacyPlanTier = 'early_access' | 'basic' | 'pro' | 'enterprise';

/**
 * All valid plan types (union of new and legacy)
 */
export type AnyPlanTier = PlanTier | LegacyPlanTier;

/**
 * Mapping from legacy to new plan names
 */
export const PLAN_MIGRATION_MAP: Readonly<Record<LegacyPlanTier, PlanTier>> = {
  early_access: 'navigator',
  basic: 'shield',
  pro: 'general_counsel',
  enterprise: 'infrastructure',
} as const;

/**
 * Plan display names for UI
 */
export const PLAN_DISPLAY_NAMES: Readonly<Record<PlanTier, string>> = {
  navigator: 'Navigator (Free)',
  shield: 'Shield',
  general_counsel: 'General Counsel',
  infrastructure: 'Infrastructure',
} as const;

/**
 * Plan pricing in AED
 */
export const PLAN_PRICING: Readonly<Record<PlanTier, number>> = {
  navigator: 0,
  shield: 249,
  general_counsel: 599,
  infrastructure: 2499,
} as const;

/**
 * Check if a plan string is a legacy plan
 */
export function isLegacyPlan(plan: string): plan is LegacyPlanTier {
  return (
    plan === 'early_access' ||
    plan === 'basic' ||
    plan === 'pro' ||
    plan === 'enterprise'
  );
}

/**
 * Check if a plan string is a valid (new or legacy) plan
 */
export function isValidPlan(plan: string): plan is AnyPlanTier {
  return isLegacyPlan(plan) || plan in PLAN_DISPLAY_NAMES;
}

/**
 * Normalize plan to new value (handles both legacy and new)
 */
export function normalizePlan(plan: AnyPlanTier): PlanTier {
  if (isLegacyPlan(plan)) {
    return PLAN_MIGRATION_MAP[plan];
  }
  return plan as PlanTier;
}

/**
 * Get all plan tiers (new names only)
 */
export function getAllPlanTiers(): PlanTier[] {
  return ['navigator', 'shield', 'general_counsel', 'infrastructure'];
}
