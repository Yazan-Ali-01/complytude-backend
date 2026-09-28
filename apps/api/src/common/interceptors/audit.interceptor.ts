import { AuditActorType, AuditService } from '@lib/audit';
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { FastifyRequest } from 'fastify';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import {
  AuthenticatedIdentityUser,
  AuthenticatedTenantUser,
} from '../../modules/auth/strategies';
import { AUDIT_KEY, AuditConfig } from '../decorators/audit.decorator';
import { sanitizeBody } from '../utils/audit-sanitize.util';

type AuditableRequest = FastifyRequest & {
  auth?: {
    tenant?: AuthenticatedTenantUser;
    identity?: AuthenticatedIdentityUser;
  };
};

interface ResolvedActor {
  actorId: string;
  tenantId?: string;
  actorType: AuditActorType;
  userRole?: string;
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

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

    const request = context.switchToHttp().getRequest<AuditableRequest>();

    const actor = this.resolveActor(request);
    if (!actor) {
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
          const ipAddress = this.resolveIpAddress(request);
          const userAgent = request.headers['user-agent'] || undefined;

          const details: Record<string, unknown> = {
            method: request.method,
            url: request.url,
          };

          if (auditConfig.options.includeBody && request.body) {
            details.body = sanitizeBody(request.body);
          }

          // Fire-and-forget: AuditService.log handles its own errors; this catch is the backstop
          this.auditService
            .log({
              ...actor,
              action: auditConfig.action,
              resourceType: resourceType ?? 'unknown',
              resourceId,
              details,
              ipAddress,
              userAgent,
            })
            .catch((error: unknown) => {
              this.logger.error(
                `Audit write failed for ${auditConfig.action}: ${error instanceof Error ? error.message : String(error)}`,
              );
            });
        },
      }),
    );
  }

  /**
   * Resolves the actor from whichever auth context is available.
   * Tenant context takes priority (has richer info: tenantId + role).
   * Falls back to identity context for pre-tenant routes (login, signup, etc.).
   * Returns null if no auth context exists (anonymous/unauthenticated).
   */
  private resolveActor(request: AuditableRequest): ResolvedActor | null {
    const tenant = request.auth?.tenant;
    const identity = request.auth?.identity;

    if (tenant) {
      return {
        actorId: tenant.userId,
        tenantId: tenant.tenantId,
        actorType: 'user',
        userRole: tenant.role,
      };
    }

    if (identity) {
      return {
        actorId: identity.userId,
        actorType: 'user',
      };
    }

    return null;
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

  private resolveIpAddress(request: FastifyRequest): string | undefined {
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
