import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../types/entitlement.types';

/**
 * Metadata key for @TrackUsage decorator
 */
export const TRACK_USAGE_KEY = 'track_usage';

/**
 * Track usage options
 */
export interface TrackUsageOptions {
  featureKey: FeatureKey;
  units: number;
}

/**
 * Track Usage Decorator
 *
 * Marks an endpoint for automatic usage tracking and quota enforcement.
 * Used with UsageEnforcementGuard to check entitlement and record usage.
 *
 * Usage:
 * ```typescript
 * @AuthOptions({ tenant: true })
 * @UseGuards(UsageEnforcementGuard)
 * @TrackUsage('documents_per_month')
 * @Post('generate')
 * async generateDocument() { ... }
 * ```
 *
 * With custom units:
 * ```typescript
 * @TrackUsage('documents_per_month', 5)
 * @Post('bulk-generate')
 * async bulkGenerate() { ... }
 * ```
 *
 * @param featureKey - Feature key to track (e.g., 'documents_per_month')
 * @param units - Number of units to consume (default 1)
 * @returns Decorator function
 */
export const TrackUsage = (featureKey: FeatureKey, units: number = 1) =>
  SetMetadata(TRACK_USAGE_KEY, { featureKey, units });
