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
 * Requires tenant token
 *
 * @example
 * ```typescript
 * @UseGuards(TenantOwnershipGuard)
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
    const tenant = request.auth?.tenant;
    const i18n = I18nContext.current();

    // Ensure tenant token is present
    if (!tenant) {
      throw new UnauthorizedException(
        i18n?.t(I18nKeys.UNAUTHORIZED) ?? 'Tenant token required',
      );
    }

    // Get tenant ID from route params or body
    const tenantIdFromRoute = request.params.tenantId || request.params.id;
    const tenantIdFromBody = request.body?.tenantId;
    const targetTenantId = tenantIdFromRoute || tenantIdFromBody;

    // If no tenant ID in request, this guard shouldn't be used
    if (!targetTenantId) {
      throw new BadRequestException(
        i18n?.t(I18nKeys.BAD_REQUEST) ?? 'Tenant ID required',
      );
    }

    // Check if user's tenant matches the requested tenant
    if (tenant.tenantId !== targetTenantId) {
      throw new ForbiddenException(
        i18n?.t(I18nKeys.FORBIDDEN) ?? 'Access denied to this tenant',
      );
    }

    return true;
  }
}
