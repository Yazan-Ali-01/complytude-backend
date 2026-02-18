import { SetMetadata } from '@nestjs/common';
import { SystemTenantRole } from '../../../common/types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route (OR logic - user needs ANY of the roles)
 *
 * Use with RolesGuard for simple role-based checks. For fine-grained permission
 * checks, use @RequireAnyTenantPermission() or @RequireAllTenantPermissions() with TenantPermissionsGuard.
 *
 * @example
 * ```typescript
 * @AuthOptions({ tenant: true })
 * @UseGuards(RolesGuard)
 * @Roles(SystemTenantRole.TENANT_ADMIN)
 * @Post('admin-only')
 * async adminOnlyAction() { }
 *
 * // Multiple roles (OR logic)
 * @Roles(SystemTenantRole.TENANT_ADMIN, SystemTenantRole.LEGAL_COUNSEL)
 * @Post('admin-or-counsel')
 * async adminOrCounselAction() { }
 * ```
 */
export const Roles = (...roles: SystemTenantRole[]) =>
  SetMetadata(ROLES_KEY, roles);
