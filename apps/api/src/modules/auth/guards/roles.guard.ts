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
import { CommonI18n } from 'src/common/constants/i18n.constants';
import { AuthI18n } from '../constants/i18n.constants';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { AuthenticatedTenantUser } from '../strategies';

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name);

  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles from decorator
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    const i18n = I18nContext.current();

    // Applied without @Roles(): a wiring mistake, so deny
    if (!requiredRoles?.length) {
      this.logger.error(
        `Denied ${context.getClass().name}.${context.getHandler().name}: RolesGuard applied without @Roles()`,
      );
      throw new ForbiddenException(
        i18n?.t(CommonI18n.errors.FORBIDDEN) ?? 'Access forbidden',
      );
    }

    const tenant = context.switchToHttp().getRequest().auth?.tenant as
      | AuthenticatedTenantUser
      | undefined;

    if (!tenant) {
      throw new UnauthorizedException(
        i18n?.t(AuthI18n.errors.TENANT_TOKEN_REQUIRED) ??
          'Tenant token required',
      );
    }

    // Check if user has one of the required roles
    const hasRole = requiredRoles.some((role) => tenant.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
