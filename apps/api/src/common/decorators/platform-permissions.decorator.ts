import { SetMetadata } from '@nestjs/common';
import type { PlatformPermission } from '../types';

export const PLATFORM_PERMISSIONS_KEY = 'platform_permissions';

export interface PlatformPermissionMetadata {
  permissions: PlatformPermission[];
  requireAll: boolean;
}

/**
 * Require ALL specified platform permissions (AND logic)
 * Use with PlatformPermissionsGuard + @AuthOptions({ identity: true })
 */
export const RequireAllPlatformPermissions = (
  ...permissions: PlatformPermission[]
) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, {
    permissions,
    requireAll: true,
  } satisfies PlatformPermissionMetadata);

/**
 * Require ANY of the specified platform permissions (OR logic)
 * Use with PlatformPermissionsGuard + @AuthOptions({ identity: true })
 */
export const RequireAnyPlatformPermission = (
  ...permissions: PlatformPermission[]
) =>
  SetMetadata(PLATFORM_PERMISSIONS_KEY, {
    permissions,
    requireAll: false,
  } satisfies PlatformPermissionMetadata);
