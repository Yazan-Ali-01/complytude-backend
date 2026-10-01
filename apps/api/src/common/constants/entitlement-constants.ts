export const FEATURE_TYPES = [
  'boolean',
  'quota',
  'metered',
  'capacity',
  'rate_limit',
] as const;
export type FeatureType = (typeof FEATURE_TYPES)[number];
export const USAGE_SOURCES = [
  'plan',
  'addon',
  'credit',
  'override',
  'mixed',
] as const;
export type UsageSource = (typeof USAGE_SOURCES)[number];
export const SUBSCRIPTION_STATUSES = [
  'active',
  'cancelled',
  'past_due',
  'trialing',
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export const CREDIT_TRANSACTION_TYPES = [
  'purchase',
  'grant',
  'deduction',
  'expiry',
  'refund',
  'reversal',
] as const;
export type CreditTransactionType = (typeof CREDIT_TRANSACTION_TYPES)[number];
