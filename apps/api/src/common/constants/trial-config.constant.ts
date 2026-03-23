/**
 * Trial Subscription Configuration
 *
 * Hardcoded for now (per product decision). Future: could be DB-driven or env-based
 * for A/B testing trial durations, partner deals, etc.
 */

import type { PlanKey } from './plan-entitlements.constant';

export const TRIAL_CONFIG = {
  /** Trial duration in days (fixed 14 days per ticket) */
  DURATION_DAYS: 14,

  /** Plan key for trial period (General Counsel - full features to hook users) */
  PLAN_KEY: 'general_counsel' as PlanKey,

  /** Plan key to downgrade to when trial expires (Navigator - free tier) */
  EXPIRY_PLAN_KEY: 'navigator' as PlanKey,
} as const;
