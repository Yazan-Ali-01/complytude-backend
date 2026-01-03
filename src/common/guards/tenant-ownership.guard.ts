import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

/**
 * Guard to check if user belongs to the tenant they're trying to access
 * Ensures users can only access/modify their own tenant data
 *
 * @example
 * ```typescript
 * @UseGuards(JwtAuthGuard, TenantOwnershipGuard)
 * @Get('tenants/:tenantId')
 * async getTenant(@Param('tenantId') tenantId: string) {
 *   // Only users belonging to this tenant can access
 * }
 * ```
 */
@Injectable()
export class TenantOwnershipGuard implements CanActivate {
  constructor(private readonly i18n: I18nService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Ensure user is authenticated
    if (!user) {
      throw new UnauthorizedException(this.i18n.t('common.UNAUTHORIZED'));
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
      throw new BadRequestException(this.i18n.t('common.BAD_REQUEST'));
    }

    // Check if user belongs to this tenant
    const userTenantId = user.tenantId;

    if (!userTenantId) {
      throw new ForbiddenException(this.i18n.t('common.FORBIDDEN'));
    }

    // Check if user's tenant matches the requested tenant
    if (userTenantId !== targetTenantId) {
      throw new ForbiddenException(this.i18n.t('common.FORBIDDEN'));
    }

    return true;
  }
}
