import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18n, I18nService } from 'nestjs-i18n';
import { AuthenticatedIdentityUser } from '../../modules/auth/strategies';
import { PlatformRbacService } from '../../modules/platform-rbac/platform-rbac.service';
import { CommonI18n } from '../constants';
import {
  PLATFORM_PERMISSIONS_KEY,
  PlatformPermissionMetadata,
} from '../decorators/platform-permissions.decorator';
import {
  hasAllPermissions,
  hasAnyPermission,
} from '../utils/permission-matcher.util';

@Injectable()
export class PlatformPermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private platformRbacService: PlatformRbacService,
    @I18n() private readonly i18n: I18nService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionMetadata =
      this.reflector.getAllAndOverride<PlatformPermissionMetadata>(
        PLATFORM_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

    if (
      !permissionMetadata ||
      !permissionMetadata.permissions ||
      permissionMetadata.permissions.length === 0
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const identity = request.auth?.identity as AuthenticatedIdentityUser;

    if (!identity) {
      throw new UnauthorizedException(
        this.i18n.t(CommonI18n.errors.UNAUTHORIZED) ??
          'Identity token required for platform permission check',
      );
    }

    const platformRole = identity.platformRole ?? null;
    if (!platformRole) {
      throw new ForbiddenException(
        this.i18n.t(CommonI18n.errors.FORBIDDEN) ?? // should be PlatformRbacI18n.errors.NO_PLATFORM_ROLE_ASSIGNED
          'No platform role assigned. Platform access requires a platform role.',
      );
    }

    const userPermissions =
      await this.platformRbacService.getRolePermissions(platformRole);

    const hasPermission = permissionMetadata.requireAll
      ? hasAllPermissions(userPermissions, permissionMetadata.permissions)
      : hasAnyPermission(userPermissions, permissionMetadata.permissions);

    if (!hasPermission) {
      const logicType = permissionMetadata.requireAll ? 'ALL' : 'ANY';
      throw new ForbiddenException(
        this.i18n.t(CommonI18n.errors.FORBIDDEN) ??
          `Platform access denied. Required ${logicType} of: ${permissionMetadata.permissions.join(', ')}`,
      );
    }

    return true;
  }
}
