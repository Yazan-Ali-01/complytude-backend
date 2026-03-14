import { CLS_TRACE_ID } from '@lib/context';
import { Injectable, Optional } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { AuditLogsRepository } from './audit.repository';
import { AuditLog, AuditLogFilters, CreateAuditLogInput } from './audit.types';

@Injectable()
export class AuditService {
  constructor(
    private readonly repository: AuditLogsRepository,
    @Optional() private readonly cls: ClsService | null,
  ) {}

  private resolveTraceId(input: CreateAuditLogInput): string | undefined {
    if (input.traceId) return input.traceId;
    return this.cls?.get<string>(CLS_TRACE_ID) ?? undefined;
  }

  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.repository.create({
        ...input,
        traceId: this.resolveTraceId(input),
      });
    } catch (error) {
      console.error('Failed to create audit log:', error);
    }
  }

  async logBatch(inputs: CreateAuditLogInput[]): Promise<void> {
    if (inputs.length === 0) return;
    try {
      await this.repository.createBatch(
        inputs.map((input) => ({
          ...input,
          traceId: this.resolveTraceId(input),
        })),
      );
    } catch (error) {
      console.error('Failed to create audit log batch:', error);
    }
  }

  async logSystemEvent(
    input: Omit<CreateAuditLogInput, 'actorId' | 'actorType'>,
  ): Promise<void> {
    return this.log({ ...input, actorType: 'system', actorId: undefined });
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
