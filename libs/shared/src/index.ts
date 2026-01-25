// ============================================
// @complytude/shared - Public API
// ============================================

// Database
export * from './database/database.service.js';
export * from './database/database.module.js';

// Repositories - Base
export * from './repositories/base/base.repository.js';
export * from './repositories/base/repository.interface.js';
export * from './repositories/base/cursor-pagination.helper.js';

// Repositories - Domain
export * from './repositories/users/user.repository.js';
export * from './repositories/users/user-tenant.repository.js';
export * from './repositories/users/refresh-token.repository.js';
export * from './repositories/users/email-verification.repository.js';
export * from './repositories/tenants/tenant.repository.js';
export * from './repositories/templates/template.repository.js';
export * from './repositories/templates/template-version.repository.js';
export * from './repositories/documents/document.repository.js';
export * from './repositories/authorities/authority.repository.js';
export * from './repositories/categories/category.repository.js';
export * from './repositories/rulesets/ruleset.repository.js';

// Repository Interfaces
export * from './repositories/users/interfaces/user.interfaces.js';
export * from './repositories/users/interfaces/user-tenant.intefaces.js';
export * from './repositories/users/interfaces/refresh-token.interfaces.js';
export * from './repositories/users/interfaces/email-verification.interface.js';

// DTOs
export * from './dto/index.js';
export * from './dto/pagination.dto.js';
export * from './dto/id-param.dto.js';
export * from './dto/error-response.dto.js';
export * from './dto/message-response.dto.js';

// Interfaces
export * from './interfaces/multer-file.interface.js';

// Types
export * from './types/plans.js';
export * from './types/validation.types.js';
export * from './types/tenant-features.interface.js';
export * from './types/entities.js';

// Constants
export * from './constants/i18n-keys.js';

// Guards
export * from './guards/features.guard.js';
export * from './guards/permissions.guard.js';
export * from './guards/usage-limit.guard.js';
export * from './guards/document-limit.guard.js';
export * from './guards/ai-rate-limit.guard.js';
export * from './guards/system-admin.guard.js';
export * from './guards/tenant-ownership.guard.js';

// Decorators
export * from './decorators/tenant.decorator.js';
export * from './decorators/features.decorator.js';
export * from './decorators/require-permissions.decorator.js';
export * from './decorators/usage-quota.decorator.js';
export * from './decorators/audit-action.decorator.js';
export * from './decorators/file-validators.decorator.js';
export * from './decorators/json-field.decorator.js';
export * from './decorators/body-dto.decorator.js';

// Interceptors
export * from './interceptors/tenant.interceptor.js';
export * from './interceptors/tenant-context.interceptor.js';
export * from './interceptors/usage-tracking.interceptor.js';
export * from './interceptors/audit-log.interceptor.js';
export * from './interceptors/fastify-multipart.interceptor.js';

// Utils
export * from './utils/helper.js';
