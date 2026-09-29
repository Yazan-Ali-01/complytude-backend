import { AuditService } from '@lib/audit';
import { ExecutionContext, Logger } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

const logger = new Logger('PermissionDeniedAudit');

/**
 * Records a refused attempt in the audit trail. Guards run before interceptors, so a 403 from a
 * permission guard would otherwise leave no trace there. Fire-and-forget, like every audit write.
 */
export function recordPermissionDenied(
  auditService: AuditService,
  context: ExecutionContext,
  who: { actorId: string; tenantId?: string; role: string | null },
  required: { permissions: string[]; requireAll?: boolean },
): void {
  const request = context.switchToHttp().getRequest<FastifyRequest>();
  auditService
    .log({
      actorId: who.actorId,
      actorType: 'user',
      tenantId: who.tenantId,
      userRole: who.role ?? undefined,
      action: 'PERMISSION_DENIED',
      resourceType: 'permissions',
      details: {
        method: request.method,
        url: request.url,
        handler: `${context.getClass().name}.${context.getHandler().name}`,
        required: required.permissions,
        requireAll: required.requireAll ?? false,
        outcome: 'failure',
        status: 403,
      },
      ipAddress: request.ip || undefined,
      userAgent: request.headers?.['user-agent'] || undefined,
    })
    .catch((error: unknown) => {
      logger.error(
        `Audit write failed for PERMISSION_DENIED: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
}
