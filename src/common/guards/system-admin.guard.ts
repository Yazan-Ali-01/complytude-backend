import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { I18nKeys } from '../constants/i18n-keys';

/**
 * Guard to check if user is a system administrator
 * System admins have platform-wide access (not tenant-specific)
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
  constructor(private readonly i18n: I18nService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Ensure user is authenticated
    if (!user) {
      throw new UnauthorizedException(this.i18n.t(I18nKeys.UNAUTHORIZED));
    }

    // Check if user is system admin
    if (!user.isSystemAdmin) {
      throw new ForbiddenException(this.i18n.t(I18nKeys.FORBIDDEN));
    }

    return true;
  }
}
