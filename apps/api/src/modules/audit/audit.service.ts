import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from '../../repositories/audit/audit-logs.repository';
import {
  AuditLogFilters,
  CreateAuditLogInput,
} from '../../repositories/audit/interfaces/audit-log.interface';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.auditLogsRepository.create(input);
    } catch (error) {
      // Audit logging must never break the application
      console.error('Failed to create audit log:', error);
    }
  }

  async logSystemEvent(
    input: Omit<CreateAuditLogInput, 'actorId' | 'actorType'>,
  ): Promise<void> {
    return this.log({ ...input, actorType: 'system', actorId: undefined });
  }

  async getAuditLogs(tenantId: string, filters?: AuditLogFilters) {
    return this.auditLogsRepository.findByTenant(tenantId, filters);
  }

  getActorAuditLogs(actorId: string, filters?: AuditLogFilters) {
    return this.auditLogsRepository.findByActor(actorId, filters);
  }

  async countAuditLogs(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ) {
    return this.auditLogsRepository.countByTenant(tenantId, filters);
  }
}
