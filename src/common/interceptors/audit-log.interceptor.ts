import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { AuditService } from '../../modules/rbac/services/audit.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit-action.decorator';

@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditLogInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditAction = this.reflector.get<string | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (!auditAction) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const { user } = request;

    if (!user?.userId || !user?.tenantId) {
      this.logger.warn('Audit action skipped: missing user context');
      return next.handle();
    }

    const startTime = Date.now();
    const resourceId = request.params?.id ?? request.params?.documentId ?? undefined;
    const aiModelUsed = request.body?.model ?? request.query?.model ?? undefined;

    this.logger.debug(
      `Audit logging enabled for action: ${auditAction}, user: ${user.userId}, resource: ${resourceId}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          // Fire-and-forget audit log - don't block response
          this.auditService
            .logFromRequest(
              auditAction,
              this.extractResourceType(auditAction),
              request as { user: { userId: string; tenantId: string; role: string }; body?: unknown; params?: unknown; query?: unknown },
              resourceId as string | undefined,
              aiModelUsed as string | undefined,
            )
            .then(() => {
              const duration = Date.now() - startTime;
              this.logger.debug(
                `Audit log created for action: ${auditAction}, duration: ${duration}ms`,
              );
            })
            .catch((error: Error) => {
              this.logger.error(
                `Failed to create audit log for action: ${auditAction}`,
                error,
              );
            });
        },
        error: (error: Error & { status?: number }) => {
          // Fire-and-forget error audit log
          this.auditService
            .log({
              userId: user.userId as string,
              tenantId: user.tenantId as string,
              roleName: user.role as string,
              action: `${auditAction}:failed`,
              resourceType: this.extractResourceType(auditAction),
              resourceId,
              metadata: {
                error: error.message,
                statusCode: error.status,
              },
            })
            .catch((auditError: Error) => {
              this.logger.error(
                `Failed to create audit log for failed action: ${auditAction}`,
                auditError,
              );
            });
        },
      }),
    );
  }

  private extractResourceType(action: string): string {
    const parts = action.split(':');
    return parts[0] ?? 'unknown';
  }
}