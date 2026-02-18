import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedTenantUser } from '../../modules/auth/strategies';
import { TenantRbacService } from '../../modules/tenant-rbac/tenant-rbac.service';
import {
  TENANT_PERMISSIONS_KEY,
  TenantPermissionMetadata,
} from '../decorators/tenant-permissions.decorator';
import {
  hasAllPermissions,
  hasAnyPermission,
} from '../utils/permission-matcher.util';

@Injectable()
export class TenantPermissionsGuard implements CanActivate {
  // Optimized permission checking:
  // 1. Fetch all role permissions once (single DB query or in-memory for system roles)
  // 2. Normalize wildcards in required permissions
  // 3. Check in-memory if user permissions satisfy requirements
  // Performance: 1 DB query per request instead of N queries

  constructor(
    private reflector: Reflector,
    private tenantRbacService: TenantRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Get required permissions metadata from decorator
    const permissionMetadata =
      this.reflector.getAllAndOverride<TenantPermissionMetadata>(
        TENANT_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

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

    // OPTIMIZATION: Fetch all role permissions once (single query or in-memory)
    // System roles: In-memory lookup (no DB query)
    // Custom roles: Single DB query with tenant context
    const userPermissions = await this.tenantRbacService.getRolePermissions(
      tenant.role,
      tenant.tenantId,
    );

    // Check permissions based on requireAll flag (in-memory)
    const hasPermission = permissionMetadata.requireAll
      ? hasAllPermissions(userPermissions, permissionMetadata.permissions)
      : hasAnyPermission(userPermissions, permissionMetadata.permissions);

    if (!hasPermission) {
      const logicType = permissionMetadata.requireAll ? 'ALL' : 'ANY';
      throw new ForbiddenException(
        `Access denied. Required ${logicType} of: ${permissionMetadata.permissions.join(', ')}`,
      );
    }

    return true;
  }
}
