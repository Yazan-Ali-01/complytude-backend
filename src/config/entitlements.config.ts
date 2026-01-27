export const ENTITLEMENTS_CONFIG = {
  featuresCacheTtlMs: 5000, // milliseconds
  defaultBillingPeriodDays: 30, // days
  usageGracePeriodHours: 0, // hours
  maxOverridesPerTenant: 50, // max override entries per tenant
  maxCacheSize: 10000, // max number of cached tenant entries
  usageResetCron: '0 0 * * *', // daily at midnight
} as const;

export const FEATURE_CATEGORY_ORDER = [
  'documents',
  'contracts',
  'regulatory',
  'jurisdiction',
  'seats',
  'isolation',
  'advanced',
  'legacy',
] as const;

export const FEATURE_DISPLAY_CONFIG: Record<
  string,
  { unit?: string; unlimitedLabel?: string }
> = {
  documents_per_month: { unit: 'documents', unlimitedLabel: 'Unlimited' },
  contract_reviews_per_month: { unit: 'reviews', unlimitedLabel: 'Unlimited' },
  regulatory_queries_per_month: {
    unit: 'queries',
    unlimitedLabel: 'Unlimited',
  },
  license_verifier_lookups: { unit: 'lookups', unlimitedLabel: 'Unlimited' },
  user_seats: { unit: 'users', unlimitedLabel: 'Unlimited' },
};

export function getEntitlementsConfig() {
  return {
    ...ENTITLEMENTS_CONFIG,
    featuresCacheTtlMs: parseInt(
      process.env.FEATURES_CACHE_TTL_MS || '5000',
      10,
    ),
    maxCacheSize: parseInt(process.env.FEATURES_MAX_CACHE_SIZE || '10000', 10),
    usageResetCron:
      process.env.USAGE_RESET_CRON || ENTITLEMENTS_CONFIG.usageResetCron,
    jobsEnabled:
      process.env.NODE_ENV !== 'test' && process.env.DISABLE_JOBS !== 'true',
  };
}
