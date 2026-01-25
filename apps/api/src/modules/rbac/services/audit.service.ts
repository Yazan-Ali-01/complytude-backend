import { Injectable, Logger } from '@nestjs/common';
import { AuditRepository } from '../repositories/audit.repository';
import {
  AuditLog,
  CreateAuditLogRow,
  AuditLogQueryOptions,
} from '../entities/audit-log.entity';

export interface CreateAuditEntryDto {
  userId: string;
  tenantId: string;
  roleName: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  aiModelUsed?: string;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryDto {
  startDate?: Date;
  endDate?: Date;
  action?: string;
  userId?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly auditRepository: AuditRepository) {}

  async log(entry: CreateAuditEntryDto): Promise<AuditLog> {
    this.logger.debug(
      `Logging audit entry: action=${entry.action}, user=${entry.userId}`,
    );

    const auditEntry: CreateAuditLogRow = {
      user_id: entry.userId,
      tenant_id: entry.tenantId,
      role_name: entry.roleName,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? null,
      metadata: entry.metadata ?? {},
      ai_model_used: entry.aiModelUsed ?? null,
      ip_address: entry.ipAddress ?? null,
      user_agent: entry.userAgent ?? null,
    };

    return this.auditRepository.log(auditEntry);
  }

  async logFromRequest(
    action: string,
    resourceType: string,
    request: {
      user: { userId: string; tenantId: string; role: string };
      body?: unknown;
      params?: unknown;
      query?: unknown;
    },
    resourceId?: string,
    aiModelUsed?: string,
  ): Promise<AuditLog> {
    const metadata: Record<string, unknown> = {
      method: request.body ? 'POST' : 'GET',
    };

    if (request.params && Object.keys(request.params).length > 0) {
      metadata.params = request.params;
    }

    if (request.query && Object.keys(request.query).length > 0) {
      metadata.query = request.query;
    }

    return this.log({
      userId: request.user.userId,
      tenantId: request.user.tenantId,
      roleName: request.user.role,
      action,
      resourceType,
      resourceId,
      metadata,
      aiModelUsed,
      ipAddress: undefined,
      userAgent: undefined,
    });
  }

  async findByTenant(
    tenantId: string,
    options?: AuditQueryDto,
  ): Promise<AuditLog[]> {
    this.logger.debug(`Finding audit logs for tenant: ${tenantId}`);

    const queryOptions: AuditLogQueryOptions = {
      tenantId,
      startDate: options?.startDate,
      endDate: options?.endDate,
      action: options?.action,
      userId: options?.userId,
      limit: options?.limit ?? 100,
      offset: options?.offset ?? 0,
    };

    return this.auditRepository.findByTenant(queryOptions);
  }

  async findByUser(userId: string, tenantId: string): Promise<AuditLog[]> {
    this.logger.debug(
      `Finding audit logs for user: ${userId}, tenant: ${tenantId}`,
    );
    return this.auditRepository.findByUser(userId, tenantId);
  }

  async findById(id: string): Promise<AuditLog | null> {
    this.logger.debug(`Finding audit log by id: ${id}`);
    return this.auditRepository.findById(id);
  }

  async countByTenant(
    tenantId: string,
    options?: AuditQueryDto,
  ): Promise<number> {
    this.logger.debug(`Counting audit logs for tenant: ${tenantId}`);

    const queryOptions: AuditLogQueryOptions = {
      tenantId,
      startDate: options?.startDate,
      endDate: options?.endDate,
      action: options?.action,
      userId: options?.userId,
    };

    return this.auditRepository.countByTenant(queryOptions);
  }

  async deleteOldLogs(beforeDate: Date): Promise<number> {
    this.logger.debug(
      `Deleting audit logs before: ${beforeDate.toISOString()}`,
    );
    return this.auditRepository.deleteOldLogs(beforeDate);
  }

  async getRecentActions(tenantId: string, limit = 10): Promise<AuditLog[]> {
    return this.findByTenant(tenantId, { limit });
  }

  async getUserActivitySummary(
    userId: string,
    tenantId: string,
    days = 7,
  ): Promise<Record<string, number>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const logs = await this.findByTenant(tenantId, {
      userId,
      startDate,
      limit: 1000,
    });

    const summary: Record<string, number> = {};
    for (const log of logs) {
      summary[log.action] = (summary[log.action] ?? 0) + 1;
    }

    return summary;
  }
}
