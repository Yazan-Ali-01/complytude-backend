/**
 * Entitlement Constants
 *
 * Single source of truth for entitlement-related string unions.
 * All types are derived from these as const arrays/objects.
 *
 * Pattern: Define canonical constants → derive types using typeof
 * Benefits: Adding a value auto-updates the type, no manual sync required
 */

// =========================
// FEATURE TYPES
// =========================

/**
 * Feature types define how features are measured and enforced
 */
export const FEATURE_TYPES = [
  'boolean',
  'quota',
  'metered',
  'capacity',
  'rate_limit',
] as const;

export type FeatureType = (typeof FEATURE_TYPES)[number];

// =========================
// USAGE SOURCES
// =========================

/**
 * Usage sources track where consumption comes from
 */
export const USAGE_SOURCES = [
  'plan',
  'addon',
  'credit',
  'override',
  'mixed',
] as const;

export type UsageSource = (typeof USAGE_SOURCES)[number];

// =========================
// SUBSCRIPTION STATUSES
// =========================

/**
 * Subscription lifecycle statuses
 */
export const SUBSCRIPTION_STATUSES = [
  'active',
  'cancelled',
  'past_due',
  'trialing',
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// =========================
// CREDIT TRANSACTION TYPES
// =========================

/**
 * Credit ledger transaction types
 */
export const CREDIT_TRANSACTION_TYPES = [
  'purchase',
  'grant',
  'deduction',
  'expiry',
  'refund',
] as const;

export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
