import { SetMetadata } from '@nestjs/common';
import { MeteredFeature } from '../../modules/tenants/entities/tenant-features.interface';

export const USAGE_FEATURE_KEY = 'usageFeature';

export const RequireUsageQuota = (feature: MeteredFeature) =>
  SetMetadata(USAGE_FEATURE_KEY, feature);

export const USAGE_INCREMENT_KEY = 'usageIncrement';
export const RequireUsageIncrement = (
  feature: MeteredFeature,
  delta: number = 1,
) => SetMetadata(USAGE_INCREMENT_KEY, { feature, delta });
