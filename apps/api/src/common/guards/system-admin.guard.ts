import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { AuthI18n } from '../../modules/auth/constants/i18n.constants';
import { AuthenticatedIdentityUser } from '../../modules/auth/strategies';
import { CommonI18n } from '../constants/i18n.constants';
import { SystemPlatformRole } from '../types/platform.types';

/**
 * Requires identity token with platform role `system_admin`.
 * Use on system-wide break-glass endpoints (e.g. admin session management).
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const identity = request.auth?.identity as
      | AuthenticatedIdentityUser
      | undefined;

    if (!identity) {
      throw new UnauthorizedException(
        I18nContext.current()?.t(AuthI18n.errors.IDENTITY_TOKEN_REQUIRED) ??
          'Identity token required',
      );
    }

    if (identity.platformRole !== SystemPlatformRole.SYSTEM_ADMIN) {
      throw new ForbiddenException(
        I18nContext.current()?.t(CommonI18n.errors.SYSTEM_ADMIN_REQUIRED) ??
          'System administrator role required',
      );
    }

    return true;
  }
}
