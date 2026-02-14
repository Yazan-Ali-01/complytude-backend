import { SetMetadata } from '@nestjs/common';
import { FeatureKey } from '../types/entitlement.types';

/**
 * Metadata key for storing required entitlements
 */
export const ENTITLEMENT_KEY = 'required_entitlements';

/**
 * Entitlement requirement definition
 */
export interface EntitlementRequirement {
  featureKey: FeatureKey;
  value_bool?: boolean;
  value_int?: number;
  value_text?: string;
  minValue?: number; // For quota/capacity: minimum required value
}

/**
 * Decorator to specify required entitlements for an endpoint.
 * Used with EntitlementGuard to enforce feature access.
 *
 * @example
 * ```typescript
 * // Boolean check (must be true)
 * @RequireEntitlement('redlining_enabled')
 * async analyzeContract() { ... }
 * ```
 *
 * @example
 * ```typescript
 * // Tiered text check (must match specific value)
 * @RequireEntitlement({ featureKey: 'template_library', value_text: 'full' })
 * async listAllTemplates() { ... }
 * ```
 *
 * @example
 * ```typescript
 * // Minimum value check (for quota/capacity)
 * @RequireEntitlement({ featureKey: 'user_seats', minValue: 5 })
 * async inviteTeamMembers() { ... }
 * ```
 *
 * @example
 * ```typescript
 * // Multiple requirements
 * @RequireEntitlement('redlining_enabled', 'localizer_check')
 * async advancedAnalysis() { ... }
 * ```
 */
export const RequireEntitlement = (
  ...requirements: (FeatureKey | EntitlementRequirement)[]
) => {
  const normalized = requirements.map(normalizeRequirement);
  return SetMetadata(ENTITLEMENT_KEY, normalized);
};

/**
 * Normalize requirement input to EntitlementRequirement object
 */
function normalizeRequirement(
  req: FeatureKey | EntitlementRequirement,
): EntitlementRequirement {
  if (typeof req === 'string') {
    // Simple string: treat as boolean feature check
    return { featureKey: req, value_bool: true };
  }
  return req;
}
