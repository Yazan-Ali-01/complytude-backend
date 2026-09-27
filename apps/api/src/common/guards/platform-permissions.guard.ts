import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { I18nContext } from 'nestjs-i18n';
import { AuthenticatedIdentityUser } from '../../modules/auth/strategies';
import { PlatformRbacService } from '../../modules/platform-rbac/platform-rbac.service';
import { CommonI18n } from '../constants/i18n.constants';
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
  private readonly logger = new Logger(PlatformPermissionsGuard.name);

  constructor(
    private reflector: Reflector,
    private platformRbacService: PlatformRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permissionMetadata =
      this.reflector.getAllAndOverride<PlatformPermissionMetadata>(
        PLATFORM_PERMISSIONS_KEY,
        [context.getHandler(), context.getClass()],
      );

    // Applied without @Require*PlatformPermission(s): a wiring mistake, so deny
    if (!permissionMetadata?.permissions?.length) {
      this.logger.error(
        `Denied ${context.getClass().name}.${context.getHandler().name}: PlatformPermissionsGuard applied without @RequireAnyPlatformPermission/@RequireAllPlatformPermissions`,
      );
      throw new ForbiddenException(
        I18nContext.current()?.t(CommonI18n.errors.FORBIDDEN) ??
          'Access forbidden',
      );
    }

    const request = context.switchToHttp().getRequest();
    const identity = request.auth?.identity as AuthenticatedIdentityUser;

    if (!identity) {
      throw new UnauthorizedException(
        'Identity token required for platform permission check',
      );
    }

    const platformRole = identity.platformRole ?? null;
    if (!platformRole) {
      throw new ForbiddenException(
        'No platform role assigned. Platform access requires a platform role.',
      );
    }

    const userPermissions =
      await this.platformRbacService.getRolePermissions(platformRole);

    const hasPermission = permissionMetadata.requireAll
      ? hasAllPermissions(userPermissions, permissionMetadata.permissions)
      : hasAnyPermission(userPermissions, permissionMetadata.permissions);

    if (!hasPermission) {
      const requiredPermission = permissionMetadata.permissions.join(', ');
      this.logger.warn(
        `Access denied: user ${identity.userId} (role: ${platformRole}) lacks permission ${requiredPermission}`,
      );
      const logicType = permissionMetadata.requireAll ? 'ALL' : 'ANY';
      throw new ForbiddenException(
        `Platform access denied. Required ${logicType} of: ${requiredPermission}`,
      );
    }

    return true;
  }
}
