import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuditService } from '@lib/audit';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
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

    const method = request.method;
    const url = request.url;
    const ipAddress = this.getIpAddress(request);
    const userAgent = request.headers['user-agent'] || undefined;

    return next.handle().pipe(
      tap({
        next: (response) => {
          if (tenant) {
            const resourceType = this.getResourceType(context, url);
            const action = this.getAction(context, method, url, resourceType);
            const resourceId = this.deriveResourceId(response);

            void this.auditService.log({
              tenantId: tenant.tenantId,
              actorId: tenant.userId,
              actorType: 'user',
              userRole: tenant.role,
              action,
              resourceType: resourceType ?? 'unknown',
              resourceId,
              details: {
                method,
                url,
                statusCode: 200,
              },
              aiModelUsed: undefined,
              ipAddress,
              userAgent,
            });
          }
        },
        error: (error) => {
          if (tenant) {
            const resourceType = this.getResourceType(context, url);
            const action = this.getAction(context, method, url, resourceType);

            void this.auditService.log({
              tenantId: tenant.tenantId,
              actorId: tenant.userId,
              actorType: 'user',
              userRole: tenant.role,
              action,
              resourceType: resourceType ?? 'unknown',
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

  private getIpAddress(request: FastifyRequest): string | undefined {
    const forwardedFor = request.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor)
        ? forwardedFor[0]
        : forwardedFor.split(',')[0];
      return ips.trim();
    }
    return request.ip || undefined;
  }

  /**
   * Priority: @AuditAction resourceType override > @AuditResource > URL parsing
   */
  private getResourceType(
    context: ExecutionContext,
    url: string,
  ): string | undefined {
    const actionConfig = this.reflector.get<AuditActionConfig | undefined>(
      AUDIT_ACTION_KEY,
      context.getHandler(),
    );
    if (actionConfig?.resourceType) {
      return actionConfig.resourceType;
    }

    const controllerResource = this.reflector.get<string | undefined>(
      AUDIT_RESOURCE_KEY,
      context.getClass(),
    );
    if (controllerResource) {
      return controllerResource;
    }

    return this.deriveResourceTypeFromUrl(url);
  }

  /**
   * Priority: @AuditAction > HTTP method mapping
   */
  private getAction(
    context: ExecutionContext,
    method: string,
    url: string,
    resourceType: string | undefined,
  ): string {
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

    return this.deriveActionFromMethod(method, resourceType || 'unknown');
  }

  /**
   * Handles: /api/documents, /api/v1/documents, /documents
   */
  private deriveResourceTypeFromUrl(url: string): string | undefined {
    const pathSegments = url.split('/').filter(Boolean);

    let startIndex = 0;
    if (pathSegments[0] === 'api') {
      startIndex = 1;
      if (pathSegments[1]?.match(/^v\d+$/)) {
        startIndex = 2;
      }
    }

    return pathSegments[startIndex] || undefined;
  }

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

  private deriveResourceId(response: unknown): string | undefined {
    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
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
