import { BaseRepository, DatabaseService } from '@lib/database';
import { Injectable } from '@nestjs/common';
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
      actorId: (row.actor_id as string) || null,
      actorType: (row.actor_type as AuditLog['actorType']) || 'user',
      userRole: (row.user_role as string) || null,
      action: row.action as string,
      resourceType: row.resource_type as string,
      resourceId: (row.resource_id as string) || null,
      details: (row.details as Record<string, unknown>) || {},
      aiModelUsed: (row.ai_model_used as string) || null,
      ipAddress: (row.ip_address as string) || null,
      userAgent: (row.user_agent as string) || null,
      traceId: (row.trace_id as string) || null,
      createdAt: row.created_at as Date,
    };
  }

  protected getSelectColumns(): string {
    return 'id, tenant_id, actor_id, actor_type, user_role, action, resource_type, resource_id, details, ai_model_used, ip_address, user_agent, trace_id, created_at';
  }

  async create(input: CreateAuditLogInput): Promise<AuditLog> {
    const query = `
      INSERT INTO ${this.tableName} (
        tenant_id, actor_id, actor_type, user_role, action, resource_type, resource_id,
        details, ai_model_used, ip_address, user_agent, trace_id
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING ${this.getSelectColumns()}
    `;

    const result = await this.executeQuery(query, [
      input.tenantId || null,
      input.actorId || null,
      input.actorType || 'user',
      input.userRole || null,
      input.action,
      input.resourceType,
      input.resourceId || null,
      JSON.stringify(input.details || {}),
      input.aiModelUsed || null,
      input.ipAddress || null,
      input.userAgent || null,
      input.traceId || null,
    ]);

    return this.mapRow(result.rows[0]);
  }

  async findByTenant(
    tenantId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }

    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }

    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
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

  async findByActor(
    actorId: string,
    filters?: AuditLogFilters,
  ): Promise<AuditLog[]> {
    const conditions: string[] = ['actor_id = $1'];
    const params: unknown[] = [actorId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }

    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }

    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
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

  async countByTenant(
    tenantId: string,
    filters?: Omit<AuditLogFilters, 'limit' | 'offset'>,
  ): Promise<number> {
    const conditions: string[] = ['tenant_id = $1'];
    const params: unknown[] = [tenantId];
    let paramIndex = 2;

    if (filters?.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filters.startDate);
    }

    if (filters?.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filters.endDate);
    }

    if (filters?.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filters.action);
    }

    if (filters?.resourceType) {
      conditions.push(`resource_type = $${paramIndex++}`);
      params.push(filters.resourceType);
    }

    if (filters?.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filters.actorType);
    }

    if (filters?.traceId) {
      conditions.push(`trace_id = $${paramIndex++}`);
      params.push(filters.traceId);
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
