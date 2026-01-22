import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/rbac.service';
import { PERMISSIONS_KEY } from '../decorators/require-permissions.decorator';
import { PermissionKey } from '../../modules/rbac/types/rbac.types';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionKey[]
    >(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.role) {
      throw new ForbiddenException('No role assigned');
    }

    const hasPermission = this.rbacService.checkPermissions(
      user.role as string,
      requiredPermissions,
    );

    await this.rbacService.logPermissionCheck({
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      action: requiredPermissions.join(','),
      granted: hasPermission,
      resourceType: this.getResourceType(context),
      resourceId: String(request.params?.id || null),
    });

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }

  private getResourceType(context: ExecutionContext): string | undefined {
    const handler = context.getHandler();
    return handler.name;
  }
}
