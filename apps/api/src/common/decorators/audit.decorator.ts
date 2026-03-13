import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'audit:config';

export interface AuditOptions {
  /** Override auto-derived resource type (defaults to first segment of controller path) */
  resourceType?: string;
  /** Route param name to extract resource ID from (falls back to response body ID) */
  resourceIdParam?: string;
  /** Include sanitized request body in audit metadata (default: false) */
  includeBody?: boolean;
}

export interface AuditConfig {
  event: string;
  options: AuditOptions;
}

/**
 * Method-level decorator for opt-in audit logging.
 * Only methods decorated with @Audit() will be logged to the audit trail.
 * Logging is fire-and-forget and only triggers on successful (2xx) responses.
 *
 * @param event - The audit event name (stored as `action` in audit_logs)
 * @param options - Optional configuration for resource type, ID extraction, and body inclusion
 *
 * @example
 * @Post(':id/export')
 * @Audit('CONTRACT_EXPORTED', { resourceIdParam: 'id' })
 * async exportContract(@Param('id') id: string) { ... }
 *
 * @example
 * @Post()
 * @Audit('TEMPLATE_CREATED', { includeBody: true })
 * async createTemplate(@Body() dto: CreateTemplateDto) { ... }
 */
export const Audit = (event: string, options?: AuditOptions) =>
  SetMetadata(AUDIT_KEY, {
    event,
    options: options ?? {},
  } satisfies AuditConfig);
