import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedIdentityUser } from '../../modules/auth/strategies';
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
      throw new UnauthorizedException('Identity token required');
    }

    if (identity.platformRole !== SystemPlatformRole.SYSTEM_ADMIN) {
      throw new ForbiddenException('System administrator role required');
    }

    return true;
  }
}
