import { CLS_TRACE_ID } from '@lib/context';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { isIP } from 'node:net';
import { AuditLogsRepository } from './audit.repository';
import {
  AuditLog,
  AuditLogFilters,
  AuditLogPage,
  AuditLogSearch,
  CreateAuditLogInput,
} from './audit.types';

const TRACE_ID_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const MAX_USER_AGENT_LENGTH = 512;
const MAX_RESOURCE_ID_LENGTH = 255;

function clamp(value: string | undefined, max: number): string | undefined {
  return value === undefined ? undefined : value.slice(0, max);
}

/**
 * Fits every value to its column (audit_logs widths) so no input, however it got there, can make
 * the INSERT fail and the row go missing. An IP or trace id that isn't one is dropped rather than
 * stored.
 */
export function normalizeAuditInput(
  input: CreateAuditLogInput,
): CreateAuditLogInput {
  return {
    ...input,
    userRole: clamp(input.userRole, 50),
    action: input.action.slice(0, 100),
    resourceType: input.resourceType.slice(0, 100),
    resourceId: clamp(input.resourceId, MAX_RESOURCE_ID_LENGTH),
    aiModelUsed: clamp(input.aiModelUsed, 100),
    ipAddress:
      input.ipAddress && isIP(input.ipAddress) ? input.ipAddress : undefined,
    userAgent: clamp(input.userAgent, MAX_USER_AGENT_LENGTH),
    traceId:
      input.traceId && TRACE_ID_PATTERN.test(input.traceId)
        ? input.traceId
        : undefined,
  };
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly repository: AuditLogsRepository,
    // Explicit token: for `ClsService | null` the emitted type metadata is Object, and nothing
    // would be injected
    @Optional() @Inject(ClsService) private readonly cls: ClsService | null,
  ) {}

  private resolveTraceId(input: CreateAuditLogInput): string | undefined {
    if (input.traceId) return input.traceId;
    return this.cls?.get<string>(CLS_TRACE_ID) ?? undefined;
  }

  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.repository.create(
        normalizeAuditInput({ ...input, traceId: this.resolveTraceId(input) }),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write audit log ${input.action}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async logBatch(inputs: CreateAuditLogInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      await this.repository.createBatch(
        inputs.map((input) =>
          normalizeAuditInput({
            ...input,
            traceId: this.resolveTraceId(input),
          }),
        ),
      );
    } catch (error) {
      this.logger.error(
        `Failed to write ${inputs.length} audit logs: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async logSystemEvent(
    input: Omit<CreateAuditLogInput, 'actorId' | 'actorType'>,
  ): Promise<void> {
    return this.log({ ...input, actorType: 'system', actorId: undefined });
  }

  /** A page of audit rows for a tenant (its own rows only) or the platform (every row). */
  search(
    scope: { tenantId: string } | 'platform',
    filters: AuditLogSearch,
  ): Promise<AuditLogPage> {
    return this.repository.search(scope, filters);
  }

  async getAuditLogs(
    tenantId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    return this.repository.findByTenant(tenantId, filters);
  }

  getActorAuditLogs(
    actorId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    return this.repository.findByActor(actorId, filters);
  }

  async countAuditLogs(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ): Promise<number> {
    return this.repository.countByTenant(tenantId, filters);
  }
}
