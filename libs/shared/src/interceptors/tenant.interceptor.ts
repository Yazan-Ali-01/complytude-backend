import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';

// Public route metadata key - can be set by the API app's Public decorator
export const IS_PUBLIC_KEY = 'isPublic';

// TenantContext interface is exported from repository.interface.ts

/**
 * Interceptor to extract tenant context from authenticated user (JWT payload)
 * Runs AFTER guards, so req.user is already populated by JwtAuthGuard
 *
 * This sets req.tenantContext for use in services/controllers
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantInterceptor.name);

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If public route or no user, skip tenant context setup
    if (isPublic || !request.user) {
      return next.handle();
    }

    // Extract tenant context from JWT payload (req.user)
    if (request.user.tenantId) {
      request.tenantContext = {
        tenantId: request.user.tenantId,
        userId: request.user.userId,
        role: request.user.role,
      };

      this.logger.debug(
        `Tenant context set: ${request.tenantContext.tenantId} (${request.tenantContext.role})`,
      );
    }

    return next.handle();
  }
}
