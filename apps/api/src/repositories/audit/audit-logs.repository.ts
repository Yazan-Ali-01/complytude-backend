import { BaseRepository } from '@lib/database';
import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service';
import {
  AuditLog,
  AuditLogFilters,
  CreateAuditLogInput,
} from './interfaces/audit-log.interface';

@Injectable()
export class AuditLogsRepository extends BaseRepository<
  AuditLog,
  CreateAuditLogInput,
  never
> {
  constructor(databaseService: DatabaseService) {
    super(databaseService, 'audit_logs');
  }

  protected mapRow(row: Record<string, unknown>): AuditLog {
    return {
      id: row.id as string,
      tenantId: (row.tenant_id as string) || null,
      userId: (row.user_id as string) || null,
      userRole: (row.user_role as string) || null,
      action: row.action as string,
      resourceType: (row.resource_type as string) || null,
      resourceId: (row.resource_id as string) || null,
      details: (row.details as Record<string, unknown>) || {},
      aiModelUsed: (row.ai_model_used as string) || null,
      ipAddress: (row.ip_address as string) || null,
      userAgent: (row.user_agent as string) || null,
      createdAt: row.created_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, user_id, user_role, action, resource_type, resource_id, details, ai_model_used, ip_address, user_agent, created_at';
  }

  /**
   * Create an audit log entry
   * @param input - Audit log data
   */
  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const query = `
      INSERT INTO ${this.tableName} (
        tenant_id, user_id, user_role, action, resource_type, resource_id,
        details, ai_model_used, ip_address, user_agent
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.executeQuery(query, [
      input.tenantId || null,
      input.userId || null,
      input.userRole || null,
      input.action,
      input.resourceType || null,
      input.resourceId || null,
      JSON.stringify(input.details || {}),
      input.aiModelUsed || null,
      input.ipAddress || null,
      input.userAgent || null,
    ]);

    return this.mapRow(result.rows[0]);
  }

  /**
   * Find audit logs by tenant ID with filters
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   */
  async findByTenant(
    tenantId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(filters.action);
      paramIndex++;
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(filters.resourceType);
      paramIndex++;
    }

    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;

    const result = await this.executeQuery(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Find audit logs by user ID with filters
   * @param userId - User ID
   * @param filters - Optional filters
   */
  async findByUser(
    userId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(filters.action);
      paramIndex++;
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(filters.resourceType);
      paramIndex++;
    }

    const query = `
      SELECT ${this.getSelectColumns()}
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT ${filters?.limit || 100}
      OFFSET ${filters?.offset || 0}
    `;

    const result = await this.executeQuery(query, params);
    return result.rows.map((row) => this.mapRow(row));
  }

  /**
   * Count audit logs by tenant
   * @param tenantId - Tenant ID
   * @param filters - Optional filters
   */
  async countByTenant(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ): Promise<number> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(filters.startDate);
      paramIndex++;
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(filters.endDate);
      paramIndex++;
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(filters.action);
      paramIndex++;
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(filters.resourceType);
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM ${this.tableName}
      WHERE ${conditions.join(' AND ')}
    `;

    const result = await this.executeQuery(query, params);
    return parseInt((result.rows[0]?.count as string) || '0', 10);
  }
}
