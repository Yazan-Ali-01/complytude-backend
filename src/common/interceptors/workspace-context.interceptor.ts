import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Interceptor to log workspace context for debugging
 */
@Injectable()
export class WorkspaceContextInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WorkspaceContextInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const workspaceContext = request.workspaceContext;

    if (workspaceContext) {
      this.logger.debug(
        `Request from workspace: ${workspaceContext.workspaceId} | Schema: ${workspaceContext.schemaName}`,
      );
    }

    const now = Date.now();

    return next.handle().pipe(
      tap(() => {
        const responseTime = Date.now() - now;
        this.logger.debug(
          `Response time: ${responseTime}ms | Workspace: ${workspaceContext?.workspaceId || 'N/A'}`,
        );
      }),
    );
  }
}
