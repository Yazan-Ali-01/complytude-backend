import { AuditLog, AuditService } from '@lib/audit';
import { Injectable } from '@nestjs/common';
import {
  AuditLogListResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';
import {
  AdminListAuditLogsQueryDto,
  ListAuditLogsQueryDto,
} from './dto/list-audit-logs-query.dto';

@Injectable()
export class AuditLogsService {
  constructor(private readonly auditService: AuditService) {}

  /** A tenant's own audit rows (RLS keeps other tenants' out). */
  listForTenant(
    tenantId: string,
    query: ListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.list({ tenantId }, query);
  }

  /** Every audit row, including platform-level ones with no tenant. */
  listForPlatform(
    query: AdminListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    return this.list('platform', query);
  }

  private async list(
    scope: { tenantId: string } | 'platform',
    query: AdminListAuditLogsQueryDto,
  ): Promise<AuditLogListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 50;
    const { items, total } = await this.auditService.search(scope, {
      tenantId: query.tenantId,
      actorId: query.actorId,
      action: query.action,
      resourceType: query.resourceType,
      startDate: query.from,
      endDate: query.to,
      limit,
      offset: (page - 1) * limit,
    });
    const totalPages = Math.ceil(total / limit);
    return {
      data: items.map((row) => this.toResponse(row)),
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  private toResponse(row: AuditLog): AuditLogResponseDto {
    return {
      id: row.id,
      tenantId: row.tenantId,
      actorId: row.actorId,
      actorType: row.actorType,
      userRole: row.userRole,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      details: row.details,
      ipAddress: row.ipAddress,
      userAgent: row.userAgent,
      traceId: row.traceId,
      createdAt: new Date(row.createdAt).toISOString(),
    };
  }
}
