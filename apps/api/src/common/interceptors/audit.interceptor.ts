import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from '../../modules/audit/audit.service';
import {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../../modules/auth/strategies';
import {
  AUDIT_ACTION_KEY,
  AUDIT_RESOURCE_KEY,
  AuditActionConfig,
} from '../decorators/audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

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
            // Get audit metadata from decorators or derive from request
            const resourceType = this.getResourceType(context, url);
            const action = this.getAction(context, method, url, resourceType);
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
            const resourceType = this.getResourceType(context, url);
            const action = this.getAction(context, method, url, resourceType);

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
   * Get resource type from decorator metadata or derive from URL
   * Priority: @AuditAction resourceType override > @AuditResource > URL parsing
   */
  private getResourceType(
    context: ExecutionContext,
    url: string,
  ): string | undefined {
    // Check for method-level resource type override
    const actionConfig = this.reflector.get<AuditActionConfig | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (actionConfig?.resourceType) {
      return actionConfig.resourceType;
    }

    // Check for controller-level resource type
    const controllerResource = this.reflector.get<string | undefined>(
      AUDIT_RESOURCE_KEY,
      context.getClass(),
    );
    if (controllerResource) {
      return controllerResource;
    }

    // Fallback: derive from URL (skip API prefix)
    return this.deriveResourceTypeFromUrl(url);
  }

  /**
   * Get action from decorator metadata or derive from HTTP method
   * Priority: @AuditAction > HTTP method mapping
   */
  private getAction(
    context: ExecutionContext,
    method: string,
    url: string,
    resourceType: string | undefined,
  ): string {
    // Check for method-level action configuration
    const actionConfig = this.reflector.get<AuditActionConfig | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );

    if (actionConfig) {
      const resource = actionConfig.resourceType || resourceType || 'unknown';
      const action = actionConfig.subResource
        ? `${actionConfig.action}_${actionConfig.subResource}`
        : actionConfig.action;
      return `${resource}:${action}`;
    }

    // Fallback: derive from HTTP method
    return this.deriveActionFromMethod(method, resourceType || 'unknown');
  }

  /**
   * Derive resource type from URL, accounting for API prefix
   * Handles: /api/documents, /api/v1/documents, /documents
   * Examples:
   * - /api/documents/123 -> documents
   * - /api/v1/templates -> templates
   * - /settings/jurisdiction -> settings
   */
  private deriveResourceTypeFromUrl(url: string): string | undefined {
    const pathSegments = url.split('/').filter(Boolean);

    // Skip common API prefixes (api, v1, v2, etc.)
    let startIndex = 0;
    if (pathSegments[0] === 'api') {
      startIndex = 1;
      // Also skip version segment if present (v1, v2, etc.)
      if (pathSegments[1]?.match(/^v\d+$/)) {
        startIndex = 2;
      }
    }

    return pathSegments[startIndex] || undefined;
  }

  /**
   * Derive action from HTTP method
   * Maps standard HTTP methods to CRUD actions
   */
  private deriveActionFromMethod(method: string, resource: string): string {
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
