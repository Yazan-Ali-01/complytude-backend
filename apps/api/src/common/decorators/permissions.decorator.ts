import { SetMetadata } from '@nestjs/common';
import { Permission } from '../types';

export const PERMISSIONS_KEY = 'permissions';

export interface PermissionMetadata {
  permissions: Permission[];
  requireAll: boolean;
}

/**
 * Decorator to require ALL specified permissions for a route (AND logic)
 * Usage: @RequireAllPermissions('documents:create', 'documents:delete')
 *
 * The user must have ALL of the specified permissions to access the route.
 * Use with PermissionsGuard to enforce permission checks.
 *
 * @example
 * ```typescript
 * @Delete(':id')
 * @UseGuards(PermissionsGuard)
 * @RequireAllPermissions('documents:read', 'documents:delete')
 * async deleteDocument() {
 *   // Only users with BOTH documents:read AND documents:delete permissions can access
 * }
 * ```
 */
export const RequireAllPermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, requireAll: true });

/**
 * Decorator to require ANY of the specified permissions for a route (OR logic)
 * Usage: @RequireAnyPermission('documents:create', 'documents:read')
 *
 * The user must have at least ONE of the specified permissions to access the route.
 * Use with PermissionsGuard to enforce permission checks.
 *
 * @example
 * ```typescript
 * @Get()
 * @UseGuards(PermissionsGuard)
 * @RequireAnyPermission('documents:read', 'documents:list')
 * async listDocuments() {
 *   // Users with EITHER documents:read OR documents:list permission can access
 * }
 * ```
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, { permissions, requireAll: false });
