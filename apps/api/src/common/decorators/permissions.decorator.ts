import { SetMetadata } from '@nestjs/common';
import { Permission } from '../types';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify required permissions for a route
 * Usage: @RequirePermissions('documents:create', 'documents:read')
 *
 * The user must have at least one of the specified permissions to access the route.
 * Use with PermissionsGuard to enforce permission checks.
 *
 * @example
 * ```typescript
 * @Post('create')
 * @UseGuards(PermissionsGuard)
 * @RequirePermissions('documents:create')
 * async createDocument() {
 *   // Only users with documents:create permission can access
 * }
 * ```
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
