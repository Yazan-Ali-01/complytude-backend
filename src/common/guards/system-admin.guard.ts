import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { I18nKeys } from '../constants/i18n-keys';

/**
 * Guard to check if user is a system administrator
 * System admins have platform-wide access (not tenant-specific)
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAccessGuard, SystemAdminGuard)
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
    const user = request.user;
    const i18n = I18nContext.current();

    // Ensure user is authenticated
    if (!user) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Unauthorized',
      );
    }

    // Check if user is system admin
    if (!user.isSystemAdmin) {
      throw new ForbiddenException(i18n?.t(I18nKeys.FORBIDDEN) ?? 'Forbidden');
    }

    return true;
  }
}
