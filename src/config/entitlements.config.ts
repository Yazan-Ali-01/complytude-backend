export const ENTITLEMENTS_CONFIG = {
  /** Cache TTL for tenant features (milliseconds) */
  featuresCacheTtlMs: 5000,
  /** Default billing period length (days) */
  defaultBillingPeriodDays: 30,
  /** Grace period after usage limit hit (hours) */
  usageGracePeriodHours: 0,
  /** Maximum override entries per tenant */
  maxOverridesPerTenant: 50,
  /** Maximum number of cached tenant entries */
  maxCacheSize: 10000,
  /** Cron expression for daily usage reset */
  usageResetCron: '0 0 * * *',
} as const;

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
