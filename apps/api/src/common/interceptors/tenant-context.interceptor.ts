import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor to log tenant context for debugging
 * Also binds tenant_id to structured logs via PinoLogger.assign()
 */
@Injectable()
export class TenantContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TenantContextInterceptor.name);

  constructor(private readonly pinoLogger: PinoLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const tenantContext = request.tenantContext;

    // Bind tenant_id and user_id to request-scoped logs
    // This enriches all subsequent logs for this request with tenant/user context
    if (tenantContext?.tenantId) {
      this.pinoLogger.assign({
        tenant_id: tenantContext.tenantId,
        user_id: request.user?.userId || request.user?.sub,
      });
    } else if (request.user?.tenantId) {
      // Fallback: check authenticated user for tenant context
      this.pinoLogger.assign({
        tenant_id: request.user.tenantId,
        user_id: request.user.userId || request.user.sub,
      });
    }

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
