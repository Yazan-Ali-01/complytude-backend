import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../../modules/auth/strategies';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        auth: {
          tenant: AuthenticatedTenantUser | undefined;
          identity: AuthenticatedIdentityUser | undefined;
        };
      }
    >();
    const tenant = request.auth?.tenant;

    // Extract request metadata
    const method = request.method;
    const url = request.url;
    const ipAddress = this.getIpAddress(request);
    const userAgent = request.headers['user-agent'] || undefined;

    return next.handle().pipe(
      tap({
        next: (response) => {
          // Only log if we have a tenant context (authenticated requests)
          if (tenant) {
            // Derive action from HTTP method and URL
            const action = this.deriveAction(method, url);
            const resourceType = this.deriveResourceType(url);
            const resourceId = this.deriveResourceId(response);

            // Log the audit entry asynchronously (fire and forget)
            void this.auditService.log({
              tenantId: tenant.tenantId,
              userId: tenant.userId,
              userRole: tenant.role,
              action,
              resourceType,
              resourceId,
              details: {
                method,
                url,
                statusCode: 200, // Success
              },
              // TODO: AI Model Used - Extract from request/response when AI features are implemented
              // aiModelUsed: request.body?.model || response?.metadata?.model || null,
              aiModelUsed: undefined,
              ipAddress,
              userAgent,
            });
          }
        },
        error: (error) => {
          // Log failed requests as well
          if (tenant) {
            const action = this.deriveAction(method, url);
            const resourceType = this.deriveResourceType(url);

            void this.auditService.log({
              tenantId: tenant.tenantId,
              userId: tenant.userId,
              userRole: tenant.role,
              action,
              resourceType,
              details: {
                method,
                url,
                statusCode: error.status || 500,
                error: error.message,
              },
              ipAddress,
              userAgent,
            });
          }
        },
      }),
    );
  }

  /**
   * Extract IP address from request
   */
  private getIpAddress(request: FastifyRequest): string | undefined {
    // Check X-Forwarded-For header first (for proxied requests)
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }

    // Fall back to direct IP
    return request.ip || undefined;
  }

  /**
   * Derive action from HTTP method and URL
   * Examples:
   * - POST /documents -> documents:create
   * - GET /documents/123 -> documents:read
   * - DELETE /documents/123 -> documents:delete
   * - PATCH /settings/jurisdiction -> settings:change_jurisdiction
   */
  private deriveAction(method: string, url: string): string {
    const pathSegments = url.split('/').filter(Boolean);
    const resource = pathSegments[0] || 'unknown';

    // Special case for settings:change_jurisdiction
    if (resource === 'settings' && url.includes('jurisdiction')) {
      return 'settings:change_jurisdiction';
    }

    // Map HTTP methods to actions
    const actionMap: Record<string, string> = {
      GET: 'read',
      POST: 'create',
      PUT: 'update',
      PATCH: 'update',
      DELETE: 'delete',
    };

    const action = actionMap[method] || 'unknown';
    return `${resource}:${action}`;
  }

  /**
   * Derive resource type from URL
   * Examples:
   * - /documents/123 -> documents
   * - /templates -> templates
   * - /settings/jurisdiction -> settings
   */
  private deriveResourceType(url: string): string | undefined {
    const pathSegments = url.split('/').filter(Boolean);
    return pathSegments[0] || undefined;
  }

  /**
   * Extract resource ID from response (if available)
   * This is a best-effort extraction - may not work for all responses
   */
  private deriveResourceId(response: unknown): string | undefined {
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      // Try common ID field names
      if (obj.id && typeof obj.id === 'string') {
        return obj.id;
      }
      if (obj.data && typeof obj.data === 'object') {
        const data = obj.data as Record<string, unknown>;
        if (data.id && typeof data.id === 'string') {
          return data.id;
        }
      }
    }
    return undefined;
  }
}
