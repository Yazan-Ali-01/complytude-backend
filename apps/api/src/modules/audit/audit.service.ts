import { Injectable } from '@nestjs/common';
import { AuditLogsRepository } from '../../repositories/audit/audit-logs.repository';
import {
  AuditLogFilters,
  CreateAuditLogInput,
} from '../../repositories/audit/interfaces/audit-log.interface';

@Injectable()
export class AuditService {
  constructor(private readonly auditLogsRepository: AuditLogsRepository) {}

  /**
   * Create an audit log entry
   * @param input - Audit log data
   */
  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      await this.auditLogsRepository.create(input);
    } catch (error) {
      // Log the error but don't throw - audit logging should not break the application
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Get audit logs for a tenant
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   */
  async getAuditLogs(tenantId: string, filters?: AuditLogFilters) {
    return this.auditLogsRepository.findByTenant(tenantId, filters);
  }

  /**
   * Get audit logs for a user
   * @param userId - User ID
   * @param filters - Optional filters
   */
  async getUserAuditLogs(userId: string, filters?: AuditLogFilters) {
    return this.auditLogsRepository.findByUser(userId, filters);
  }

  /**
   * Count audit logs for a tenant
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   */
  async countAuditLogs(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ) {
    return this.auditLogsRepository.countByTenant(tenantId, filters);
  }
}
