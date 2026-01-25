import { SetMetadata } from '@nestjs/common';
import { MeteredFeature } from '../../modules/tenants/entities/tenant-features.interface';

export const USAGE_FEATURE_KEY = 'usageFeature';

export interface UsageQuotaMeta {
  feature: MeteredFeature;
  delta: number;
}

/**
 * Decorator that enforces a usage quota check (guard) and auto-increments usage (interceptor) on success.
 * @param feature - The metered feature key to check and track
 * @param delta - Amount to increment on success (default: 1, must be >= 1)
 */
export const RequireUsageQuota = (feature: MeteredFeature, delta: number = 1) =>
  SetMetadata(USAGE_FEATURE_KEY, { feature, delta } satisfies UsageQuotaMeta);
