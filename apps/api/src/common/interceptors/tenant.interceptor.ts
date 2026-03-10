import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { AUTH_OPTIONS_KEY } from 'src/modules/auth/decorators/auth-options.decorator';

export interface TenantContext {
  tenantId: string;
  userId?: string;
  role?: string;
}

/**
 * Interceptor to extract tenant context from authenticated user (JWT payload)
 * Runs AFTER guards, so req.auth.tenant is already populated by JwtAuthGuard
 *
 * This sets req.tenantContext for use in services/controllers
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    // Check if route is public
    const authOptions = this.reflector.getAllAndOverride<{
      tenant?: boolean;
      identity?: boolean;
    }>(AUTH_OPTIONS_KEY, [context.getHandler(), context.getClass()]);

    // If public route or no user, skip tenant context setup
    if (!authOptions || authOptions.tenant === false || !request.auth.tenant) {
      return next.handle();
    }

    // Extract tenant context from JWT payload (req.user)
    if (request.auth.tenant.tenantId) {
      request.tenantContext = {
        tenantId: request.auth.tenant.tenantId,
        userId: request.auth.tenant.userId,
        role: request.auth.tenant.role,
      };

      this.logger.debug(
        `Tenant context set: ${request.tenantContext.tenantId} (${request.tenantContext.role})`,
      );
    }

    return next.handle();
  }
}
