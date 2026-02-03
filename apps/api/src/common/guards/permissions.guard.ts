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
import {
  PERMISSIONS_KEY,
  PermissionMetadata,
} from '../decorators/permissions.decorator';
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
    // Get required permissions metadata from decorator
    const permissionMetadata =
      this.reflector.getAllAndOverride<PermissionMetadata>(PERMISSIONS_KEY, [
        context.getHandler(),
        context.getClass(),
      ]);

    // If no permissions are required, allow access
    if (
      !permissionMetadata ||
      !permissionMetadata.permissions ||
      permissionMetadata.permissions.length === 0
    ) {
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

    // Check permissions based on requireAll flag
    const hasPermission = permissionMetadata.requireAll
      ? await this.checkAllPermissions(
          tenant.role,
          permissionMetadata.permissions,
        )
      : await this.checkAnyPermission(
          tenant.role,
          permissionMetadata.permissions,
        );

    if (!hasPermission) {
      const logicType = permissionMetadata.requireAll ? 'ALL' : 'ANY';
      throw new ForbiddenException(
        `Access denied. Required ${logicType} of: ${permissionMetadata.permissions.join(', ')}`,
      );
    }

    return true;
  }

  /**
   * Check if a role has at least ONE of the required permissions (OR logic)
   * @param roleKey - User's role key
   * @param requiredPermissions - Array of required permissions
   * @returns true if role has at least one permission, false otherwise
   */
  private async checkAnyPermission(
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

  /**
   * Check if a role has ALL of the required permissions (AND logic)
   * @param roleKey - User's role key
   * @param requiredPermissions - Array of required permissions
   * @returns true if role has all permissions, false otherwise
   */
  private async checkAllPermissions(
    roleKey: string,
    requiredPermissions: Permission[],
  ): Promise<boolean> {
    // Check each required permission
    for (const permission of requiredPermissions) {
      const hasPermission = await this.rbacService.hasPermission(
        roleKey,
        permission,
      );

      if (!hasPermission) {
        return false; // User is missing at least one required permission
      }
    }

    return true; // User has all required permissions
  }
}
