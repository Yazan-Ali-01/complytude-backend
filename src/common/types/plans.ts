/**
 * Subscription plan tiers (UAE Legal AI Platform)
 */
export type PlanTier =
  | 'navigator'
  | 'shield'
  | 'general_counsel'
  | 'infrastructure';

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
 * Check if a plan string is a valid plan tier
 */
export function isValidPlan(plan: string): plan is PlanTier {
  return plan in PLAN_DISPLAY_NAMES;
}

/**
 * Get all plan tiers
 */
export function getAllPlanTiers(): PlanTier[] {
  return ['navigator', 'shield', 'general_counsel', 'infrastructure'];
}
