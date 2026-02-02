import { SetMetadata } from '@nestjs/common';
import { TenantRole } from 'src/common/types';

export const ROLES_KEY = 'roles';

/**
 * Decorator to specify required roles for a route
 * Usage: @Roles(TenantRole.TENANT_ADMIN, TenantRole.MEMBER)
 */
export const Roles = (...roles: TenantRole[]) => SetMetadata(ROLES_KEY, roles);
