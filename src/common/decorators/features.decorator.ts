import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for storing required features
 */
export const FEATURES_KEY = 'required_features';

/**
 * Decorator to specify required features for an endpoint
 * Can be applied multiple times or with multiple features
 *
 * @example
 * ```typescript
 * @RequireFeature('analyzer_enabled')
 * @RequireFeature('checklist_access')
 * async analyzeDocument() { ... }
 * ```
 *
 * @example
 * ```typescript
 * @RequireFeature('analyzer_enabled', 'checklist_access')
 * async analyzeDocument() { ... }
 * ```
 */
export const RequireFeature = (...features: string[]) =>
  SetMetadata(FEATURES_KEY, features);
