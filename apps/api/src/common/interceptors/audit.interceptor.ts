import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { AuditService } from '@lib/audit';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../../modules/auth/strategies';
import { AUDIT_KEY, AuditConfig } from '../decorators/audit.decorator';
import { sanitizeBody } from '../utils/audit-sanitize.util';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly auditService: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const auditConfig = this.reflector.get<AuditConfig | undefined>(
      AUDIT_KEY,
      context.getHandler(),
    );

    if (!auditConfig) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<
      FastifyRequest & {
        auth: {
          tenant: AuthenticatedTenantUser | undefined;
          identity: AuthenticatedIdentityUser | undefined;
        };
      }
    >();
    const tenant = request.auth?.tenant;

    if (!tenant) {
      return next.handle();
    }

    return next.handle().pipe(
      tap({
        next: (response) => {
          const resourceType = this.resolveResourceType(auditConfig, context);
          const resourceId = this.resolveResourceId(
            auditConfig,
            request,
            response,
          );
          const ipAddress = this.getIpAddress(request);
          const userAgent = request.headers['user-agent'] || undefined;

          const details: Record<string, unknown> = {
            method: request.method,
            url: request.url,
          };

          if (auditConfig.options.includeBody && request.body) {
            details.body = sanitizeBody(request.body);
          }

          void this.auditService.log({
            tenantId: tenant.tenantId,
            actorId: tenant.userId,
            actorType: 'user',
            userRole: tenant.role,
            action: auditConfig.event,
            resourceType: resourceType ?? 'unknown',
            resourceId,
            details,
            ipAddress,
            userAgent,
          });
        },
      }),
    );
  }

  /**
   * Priority: explicit option > controller @Controller() path > undefined
   */
  private resolveResourceType(
    config: AuditConfig,
    context: ExecutionContext,
  ): string | undefined {
    if (config.options.resourceType) {
      return config.options.resourceType;
    }

    const controllerPath = this.reflector.get<string>(
      PATH_METADATA,
      context.getClass(),
    );
    if (controllerPath) {
      const firstSegment = controllerPath.split('/').filter(Boolean)[0];
      return firstSegment || undefined;
    }

    return undefined;
  }

  /**
   * Primary: route params (via resourceIdParam).
   * Fallback: response body (response.id or response.data.id).
   */
  private resolveResourceId(
    config: AuditConfig,
    request: FastifyRequest,
    response: unknown,
  ): string | undefined {
    if (config.options.resourceIdParam) {
      const paramValue = (request.params as Record<string, string>)?.[
        config.options.resourceIdParam
      ];
      if (paramValue) return paramValue;
    }

    if (response && typeof response === 'object') {
      const obj = response as Record<string, unknown>;
      if (obj.id && typeof obj.id === 'string') return obj.id;
      if (obj.data && typeof obj.data === 'object') {
        const data = obj.data as Record<string, unknown>;
        if (data.id && typeof data.id === 'string') return data.id;
      }
    }

    return undefined;
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
}
