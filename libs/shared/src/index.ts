// =============================================================================
// @complytude/shared - Barrel Export
// =============================================================================
// This file exports all shared code for use by apps (api, worker-ingestion, worker-ai)
// Usage: import { DatabaseModule, TenantRepository } from '@complytude/shared';
// =============================================================================

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------
export * from './types/rbac.types';

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
export { default as appConfig } from './config/app.config';
export { default as databaseConfig } from './config/database.config';
export { default as jwtConfig } from './config/jwt.config';
export { default as storageConfig } from './config/storage.config';
export {
  PLAN_FEATURES,
  PLAN_METADATA,
  CREDIT_PRICES,
  USAGE_TRACKED_FEATURES,
  type UsageTrackedFeature,
  getDefaultPlanFeatures,
  isValidPlan,
  isUsageTrackedFeature,
  getDocumentCreditsRequired,
  getCreditPrice,
} from './config/plan-features.config';
export * from './config/env.schema';

// -----------------------------------------------------------------------------
// Entity Types (re-exported for convenience)
// -----------------------------------------------------------------------------
export type { PlanType, TenantFeatures } from './entities/tenant.entity';

// -----------------------------------------------------------------------------
// Database
// -----------------------------------------------------------------------------
export * from './database/database.module';
export * from './database/database.service';

// -----------------------------------------------------------------------------
// Entities
// -----------------------------------------------------------------------------
export * from './entities/authority.entity';
export * from './entities/category.entity';
export * from './entities/permission.entity';
export * from './entities/role-permission.entity';
export * from './entities/ruleset.entity';
export * from './entities/template.entity';
export * from './entities/template-version.entity';
export * from './entities/tenant.entity';
export * from './entities/user.entity';
export * from './entities/user-tenant.entity';

// -----------------------------------------------------------------------------
// Common - Constants
// -----------------------------------------------------------------------------
export * from './common/constants/i18n-keys';

// -----------------------------------------------------------------------------
// Common - Decorators
// -----------------------------------------------------------------------------
export * from './common/decorators/body-dto.decorator';
export * from './common/decorators/features.decorator';
export * from './common/decorators/file-validators.decorator';
export * from './common/decorators/rbac.decorators';
export * from './common/decorators/require-permissions.decorator';
export * from './common/decorators/require-usage.decorator';
export { TenantContext, TenantId, SchemaName } from './common/decorators/tenant.decorator';

// NOTE: json-field.decorator.ts depends on fastify-multipart and is kept in apps/api/

// -----------------------------------------------------------------------------
// Common - Exceptions
// -----------------------------------------------------------------------------
export * from './common/exceptions/validation.exception';

// -----------------------------------------------------------------------------
// Common - Guards
// -----------------------------------------------------------------------------
export * from './common/guards/system-admin.guard';
export * from './common/guards/tenant-ownership.guard';

// NOTE: The following guards depend on RbacService and are kept in apps/api/
// - ai-model.guard.ts
// - permissions.guard.ts
// - role-rate-limit.guard.ts
// - document-limit.guard.ts (depends on TenantService)
// - features.guard.ts (depends on FeaturesService)
// - usage-limit.guard.ts (depends on FeaturesService)

// -----------------------------------------------------------------------------
// Common - Interceptors
// -----------------------------------------------------------------------------
export * from './common/interceptors/tenant-context.interceptor';

// NOTE: The following depend on moved modules and are kept in apps/api/
// - fastify-multipart.interceptor.ts (depends on fastify API)
// - tenant.interceptor.ts (depends on auth decorators)
// - usage-consume.interceptor.ts (depends on FeaturesService)
// - pii-masking.interceptor.ts (depends on RbacService)

// -----------------------------------------------------------------------------
// Common - Interfaces
// -----------------------------------------------------------------------------
export * from './common/interfaces/multer-file.interface';

// NOTE: tenant.middleware.ts depends on tenant entities and is kept in apps/api/

// -----------------------------------------------------------------------------
// Common - Pipes
// -----------------------------------------------------------------------------
export * from './common/pipes/validation-exception.factory';

// -----------------------------------------------------------------------------
// Common - Swagger
// -----------------------------------------------------------------------------
export * from './common/swagger/common';

// -----------------------------------------------------------------------------
// Common - Types
// -----------------------------------------------------------------------------
export * from './common/types/validation.types';

// -----------------------------------------------------------------------------
// Common - Utilities
// -----------------------------------------------------------------------------
export * from './common/helper';

// -----------------------------------------------------------------------------
// i18n
// -----------------------------------------------------------------------------
export * from './i18n/i18n.module';
export * from './i18n/i18n.types';