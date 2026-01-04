import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';

export interface WorkspaceContext {
  workspaceId: string;
  schemaName: string;
  userId?: string;
  role?: string;
}

/**
 * Interceptor to extract workspace context from authenticated user (JWT payload)
 * Runs AFTER guards, so req.user is already populated by JwtAuthGuard
 *
 * This sets req.workspaceContext for use in services/controllers
 */
@Injectable()
export class WorkspaceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(WorkspaceInterceptor.name);

  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If public route or no user, skip workspace context setup
    if (isPublic || !request.user) {
      return next.handle();
    }

    // Extract workspace context from JWT payload (req.user)
    if (request.user.workspaceId) {
      request.workspaceContext = {
        workspaceId: request.user.workspaceId,
        schemaName: `workspace_${request.user.workspaceId.replace(/-/g, '_')}`,
        userId: request.user.userId,
        role: request.user.role,
      };

      this.logger.debug(
        `Workspace context set: ${request.workspaceContext.workspaceId} (${request.workspaceContext.role})`,
      );
    }

    return next.handle();
  }
}
