import { SetMetadata } from '@nestjs/common';
import { TenantPermission } from '../types';

export const TENANT_PERMISSIONS_KEY = 'tenant_permissions';

export interface TenantPermissionMetadata {
  permissions: TenantPermission[];
  requireAll: boolean;
}

/**
 * Decorator to require ALL specified permissions for a route (AND logic)
 *
 * Usage: @RequireAllTenantPermissions('documents:create', 'documents:delete')
 *
 * The user must have permissions that COVER ALL of the required permissions.
 * Use with TenantPermissionsGuard to enforce permission checks.
 *
 * **Permission Matching Model:**
 * The system checks if the user's permissions COVER the required permissions.
 * Wildcards work in USER permissions (not in required permissions):
 * - User with `documents:*` covers any `documents:X` requirement
 * - User with `*:*` covers any permission requirement
 *
 * **Best Practice:** Use CONCRETE permissions in decorators. Users with wildcard
 * permissions (e.g., LEGAL_COUNSEL with `documents:*`) will automatically satisfy
 * concrete requirements (e.g., `documents:read`).
 *
 * @example
 * ```typescript
 * // ✅ RECOMMENDED: Require multiple concrete permissions (AND logic)
 * @Delete(':id')
 * @UseGuards(TenantPermissionsGuard)
 * @RequireAllTenantPermissions('documents:read', 'documents:delete')
 * async deleteDocument() {
 *   // User must have permissions covering BOTH requirements
 *   // TENANT_ADMIN: ✅ (has *:*)
 *   // LEGAL_COUNSEL: ✅ (has documents:* which covers both)
 *   // MEMBER: ❌ (has documents:read but not documents:delete)
 * }
 *
 * // ✅ Single concrete permission
 * @Post()
 * @UseGuards(TenantPermissionsGuard)
 * @RequireAllTenantPermissions('documents:create')
 * async createDocument() {
 *   // LEGAL_COUNSEL: ✅ (documents:* covers documents:create)
 *   // MEMBER: ✅ (has documents:create)
 *   // VIEWER: ❌ (only has documents:read)
 * }
 * ```
 */
export const RequireAllTenantPermissions = (
  ...permissions: TenantPermission[]
) => SetMetadata(TENANT_PERMISSIONS_KEY, { permissions, requireAll: true });

/**
 * Decorator to require ANY of the specified permissions for a route (OR logic)
 *
 * Usage: @RequireAnyTenantPermission('documents:create', 'documents:read')
 *
 * The user must have at least ONE permission that COVERS any of the required permissions.
 * Use with TenantPermissionsGuard to enforce permission checks.
 *
 * **Permission Matching Model:**
 * The system checks if the user's permissions COVER at least one required permission.
 * Wildcards work in USER permissions (not in required permissions):
 * - User with `documents:*` covers any `documents:X` requirement
 * - User with `*:*` covers any permission requirement
 *
 * **Best Practice:** Use CONCRETE permissions in decorators. Users with wildcard
 * permissions will automatically satisfy concrete requirements.
 *
 * @example
 * ```typescript
 * // ✅ RECOMMENDED: Multiple concrete options (OR logic)
 * @Get()
 * @UseGuards(TenantPermissionsGuard)
 * @RequireAnyTenantPermission('documents:read', 'documents:create')
 * async listDocuments() {
 *   // User needs permission covering EITHER requirement
 *   // TENANT_ADMIN: ✅ (has *:*)
 *   // LEGAL_COUNSEL: ✅ (documents:* covers documents:read)
 *   // MEMBER: ✅ (has documents:read)
 *   // VIEWER: ✅ (has documents:read)
 * }
 *
 * // ✅ Single concrete permission (simplest case)
 * @Get(':id')
 * @UseGuards(TenantPermissionsGuard)
 * @RequireAnyTenantPermission('documents:read')
 * async getDocument() {
 *   // LEGAL_COUNSEL: ✅ (documents:* covers documents:read)
 *   // MEMBER: ✅ (has documents:read)
 *   // VIEWER: ✅ (has documents:read)
 * }
 *
 * // ✅ Requiring wildcard permission itself
 * @Post('batch-operations')
 * @UseGuards(TenantPermissionsGuard)
 * @RequireAnyTenantPermission('documents:*')
 * async batchOperations() {
 *   // Only users with the literal wildcard permission
 *   // TENANT_ADMIN: ✅ (has *:*)
 *   // LEGAL_COUNSEL: ✅ (has documents:*)
 *   // MEMBER: ❌ (has documents:read, not documents:*)
 * }
 * ```
 */
export const RequireAnyTenantPermission = (
  ...permissions: TenantPermission[]
) => SetMetadata(TENANT_PERMISSIONS_KEY, { permissions, requireAll: false });
