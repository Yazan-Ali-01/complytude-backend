import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { AuthenticatedIdentityUser } from 'src/modules/auth/strategies';
import { I18nKeys } from '../constants/i18n-keys';
import { GlobalRole } from '../types';

/**
 * Guard to check if user is a system administrator
 * System admins have platform-wide access (not tenant-specific)
 * Requires identity token with SYSTEM_ADMIN role
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, SystemAdminGuard)
 * @Get('admin/tenants')
 * async listAllTenants() {
 *   // Only system admins can access
 * }
 * ```
 */
@Injectable()
export class SystemAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const identity = request.auth?.identity as AuthenticatedIdentityUser;
    const i18n = I18nContext.current();

    // Ensure identity token is present
    if (!identity) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Identity token required',
      );
    }

    // Check if user has SYSTEM_ADMIN role
    if (!identity.globalRoles?.includes(GlobalRole.SYSTEM_ADMIN)) {
      throw new ForbiddenException(
        i18n?.t(I18nKeys.FORBIDDEN) ?? 'System admin access required',
      );
    }

    return true;
  }
}
