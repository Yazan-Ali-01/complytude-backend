import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedTenantUser } from '../../modules/auth/strategies';
import { RbacService } from '../../modules/rbac/rbac.service';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator';
import { Permission } from '../types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  // TODO: Implement caching for role-permission mappings (in-memory Map or Redis)
  // This guard currently queries the database on every request.
  // For better performance, cache the role-permission mappings:
  // 1. Load all role-permission mappings on application startup
  // 2. Store in a Map<roleKey, Set<permissionKey>> for O(1) lookups
  // 3. Implement cache invalidation when permissions are updated (MVP+)
  // 4. Consider using Redis for distributed caching in multi-instance deployments

  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions from decorator
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no permissions are required, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const tenant = request.auth?.tenant as AuthenticatedTenantUser;

    // Ensure tenant token is present
    if (!tenant) {
      throw new UnauthorizedException(
        'Tenant token required for permission check',
      );
    }

    // Ensure role is present in tenant token
    if (!tenant.role) {
      throw new UnauthorizedException('Role not found in tenant token');
    }

    // Check if user's role has at least one of the required permissions
    const hasPermission = await this.checkPermissions(
      tenant.role,
      requiredPermissions,
    );

    if (!hasPermission) {
      throw new ForbiddenException(
        `Access denied. Required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  /**
   * Check if a role has at least one of the required permissions
   * @param roleKey - User's role key
   * @param requiredPermissions - Array of required permissions
   * @returns true if role has at least one permission, false otherwise
   */
  private async checkPermissions(
    roleKey: string,
    requiredPermissions: Permission[],
  ): Promise<boolean> {
    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await this.rbacService.hasPermission(
        roleKey,
        permission,
      );

      if (hasPermission) {
        return true; // User has at least one required permission
      }
    }

    return false; // User doesn't have any of the required permissions
  }
}
