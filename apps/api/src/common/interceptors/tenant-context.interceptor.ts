import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor to log tenant context for debugging
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantContext = request.tenantContext;

    if (tenantContext) {
      this.logger.debug(
        `Request from tenant: ${tenantContext.tenantId} | Schema: ${tenantContext.schemaName}`,
      );
    }

    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        this.logger.debug(
          `Response time: ${responseTime}ms | Tenant: ${tenantContext?.tenantId || 'N/A'}`,
        );
      }),
    );
  }
}
