import { SetMetadata } from '@nestjs/common';
import { TenantPermission } from '../types';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionMetadata {
  permissions: TenantPermission[];
  requireAll: boolean;
}

/**
 * Decorator to require ALL specified permissions for a route (AND logic)
 * Supports wildcard patterns: 'documents:*', '*:read', '*:*'
 *
 * Usage: @RequireAllPermissions('documents:create', 'documents:delete')
 *
 * The user must have ALL of the specified permissions to access the route.
 * Use with PermissionsGuard to enforce permission checks.
 *
 * **IMPORTANT: For wildcards, prefer @RequireAnyPermission instead!**
 * - `@RequireAllPermissions('documents:*')` checks if user has the literal wildcard permission
 * - `@RequireAnyPermission('documents:*')` checks if user has any document permission (more intuitive)
 *
 * @example
 * ```typescript
 * // ✅ RECOMMENDED: Multiple concrete permissions (AND logic)
 * @Delete(':id')
 * @UseGuards(PermissionsGuard)
 * @RequireAllPermissions('documents:read', 'documents:delete')
 * async deleteDocument() {
 *   // User must have BOTH documents:read AND documents:delete
 *   // LEGAL_COUNSEL: ✅ (has documents:*)
 *   // MEMBER: ❌ (only has documents:read)
 * }
 *
 * // ⚠️ CONFUSING: Single wildcard with RequireAll
 * @Post()
 * @UseGuards(PermissionsGuard)
 * @RequireAllPermissions('documents:*')
 * async createDocument() {
 *   // Checks if user has the literal 'documents:*' permission
 *   // LEGAL_COUNSEL: ✅ (has documents:*)
 *   // MEMBER: ❌ (has documents:read, not the wildcard itself)
 *   // Consider using @RequireAnyPermission('documents:*') instead!
 * }
 * ```
 */
export const RequireAllPermissions = (...permissions: TenantPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, requireAll: true });

/**
 * Decorator to require ANY of the specified permissions for a route (OR logic)
 * Supports wildcard patterns: 'documents:*', '*:read', '*:*'
 *
 * Usage: @RequireAnyPermission('documents:create', 'documents:read')
 *
 * The user must have at least ONE of the specified permissions to access the route.
 * Use with PermissionsGuard to enforce permission checks.
 *
 * **RECOMMENDED: Use this decorator for wildcards!**
 * - `@RequireAnyPermission('documents:*')` matches any document permission (intuitive)
 * - Works with both wildcard permissions and concrete permissions
 *
 * @example
 * ```typescript
 * // ✅ RECOMMENDED: Multiple options (OR logic)
 * @Get()
 * @UseGuards(PermissionsGuard)
 * @RequireAnyPermission('documents:read', 'documents:list')
 * async listDocuments() {
 *   // User needs EITHER documents:read OR documents:list
 *   // LEGAL_COUNSEL: ✅ (has documents:*)
 *   // MEMBER: ✅ (has documents:read)
 *   // VIEWER: ✅ (has documents:read)
 * }
 *
 * // ✅ RECOMMENDED: Wildcard with RequireAny (most intuitive)
 * @Get(':id')
 * @UseGuards(PermissionsGuard)
 * @RequireAnyPermission('documents:*')
 * async getDocument() {
 *   // Matches users with ANY document permission
 *   // LEGAL_COUNSEL: ✅ (has documents:*)
 *   // MEMBER: ✅ (has documents:read, which matches documents:*)
 *   // VIEWER: ✅ (has documents:read, which matches documents:*)
 * }
 *
 * // ✅ Cross-resource wildcard
 * @Get('read-anything')
 * @UseGuards(PermissionsGuard)
 * @RequireAnyPermission('*:read')
 * async readAnything() {
 *   // Matches users with any read permission on any resource
 *   // Anyone with documents:read, templates:read, etc. can access
 * }
 * ```
 */
export const RequireAnyPermission = (...permissions: TenantPermission[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, requireAll: false });
