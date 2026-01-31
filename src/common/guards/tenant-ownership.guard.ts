import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { I18nContext } from 'nestjs-i18n';
import { I18nKeys } from '../constants/i18n-keys';

/**
 * Guard to check if user belongs to the tenant they're trying to access
 * Ensures users can only access/modify their own tenant data
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAccessGuard, TenantOwnershipGuard)
 * @Get('tenants/:tenantId')
 * async getTenant(@Param('tenantId') tenantId: string) {
 *   // Only users belonging to this tenant can access
 * }
 * ```
 */
@Injectable()
export class TenantOwnershipGuard implements CanActivate {
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

    // System admins bypass tenant ownership checks
    if (user.isSystemAdmin) {
      return true;
    }

    // Get tenant ID from route params or body
    const tenantIdFromRoute = request.params.tenantId || request.params.id;
    const tenantIdFromBody = request.body?.tenantId;
    const targetTenantId = tenantIdFromRoute || tenantIdFromBody;

    // If no tenant ID in request, this guard shouldn't be used
    if (!targetTenantId) {
      throw new BadRequestException(
        i18n?.t(I18nKeys.BAD_REQUEST) ?? 'Bad Request',
      );
    }

    // Check if user belongs to this tenant
    const userTenantId = user.tenantId;

    if (!userTenantId) {
      throw new ForbiddenException(i18n?.t(I18nKeys.FORBIDDEN) ?? 'Forbidden');
    }

    // Check if user's tenant matches the requested tenant
    if (userTenantId !== targetTenantId) {
      throw new ForbiddenException(i18n?.t(I18nKeys.FORBIDDEN) ?? 'Forbidden');
    }

    return true;
  }
}
