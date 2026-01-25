import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../../modules/rbac/services/rbac.service';
import { PERMISSIONS_KEY, PermissionRequirement } from '../decorators/require-permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionRequirement[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    if (user.isSystemAdmin) {
      return true;
    }

    const role = user.role as string;
    const userPermissions = await this.rbacService.getPermissionsForRole(role as any);
    const hasPermission = this.checkPermissions(requiredPermissions, userPermissions);

    if (!hasPermission) {
      throw new ForbiddenException(
        `Missing required permission(s): ${JSON.stringify(requiredPermissions)}`,
      );
    }

    return true;
  }

  private checkPermissions(
    required: PermissionRequirement[],
    userPerms: Set<string>,
  ): boolean {
    return required.some((req) => {
      if (typeof req === 'string') {
        return userPerms.has(req);
      }
      if ('all' in req && Array.isArray(req.all)) {
        return req.all.every((p) => userPerms.has(p));
      }
      return false;
    });
  }
}